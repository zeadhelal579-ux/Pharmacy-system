// ============================================================
// ReportService.cs
// ------------------------------------------------------------
// Purpose: Read-side reporting logic (expiring batches, shortage
// alerts) plus the shortage-detection scan.
//
// SECURITY CHANGE: GetExpiringBatchesAsync and GetShortageAlertsAsync
// now accept an optional locationId filter. When null (SuperAdmin
// callers), results span every location as before. When a specific
// locationId is passed (every other role), results are restricted
// to that one location only — a BranchManager/Cashier/WarehouseAdmin
// can no longer see expiry/shortage data belonging to a different
// branch or the warehouse just by calling the API directly.
//
// Structure (otherwise unchanged):
//   1. Constructor — injects AppDbContext.
//   2. GetExpiringBatchesAsync(days, locationId) — filters by
//      ExpiryDate window and, if locationId is not null, by
//      b.LocationId == locationId.
//   3. GetShortageAlertsAsync(locationId) — same optional filter.
//   4. CheckAndCreateShortageAlertsAsync() — unchanged, this is a
//      system-wide background scan (Hangfire job), not a per-user
//      request, so it always scans every location regardless.
//
// Consumed by: ReportsController (all read endpoints now pass the
// caller's own locationId, or null if SuperAdmin), ExpiryCheckerJob,
// LowStockCheckerJob.
// ============================================================
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Services
{
    public class ReportService
    {
        private readonly AppDbContext _context;

        public ReportService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<Batch>> GetExpiringBatchesAsync(int days = 90, int? locationId = null)
        {
            var expiryLimit = DateTime.Now.AddDays(days);

            var query = _context.Batches
                .Where(b => !b.IsDeleted && b.Quantity > 0 && b.ExpiryDate <= expiryLimit);

            if (locationId.HasValue)
                query = query.Where(b => b.LocationId == locationId.Value);

            return await query
                .Include(b => b.Product)
                .Include(b => b.Location)
                .OrderBy(b => b.ExpiryDate)
                .ToListAsync();
        }

        public async Task<IEnumerable<ShortageAlert>> GetShortageAlertsAsync(int? locationId = null)
        {
            var query = _context.ShortageAlerts
                .Where(s => !s.IsDeleted && !s.IsResolved);

            if (locationId.HasValue)
                query = query.Where(s => s.LocationId == locationId.Value);

            return await query
                .Include(s => s.Product)
                .Include(s => s.Location)
                .OrderByDescending(s => s.CreatedAt)
                .ToListAsync();
        }

        public async Task CheckAndCreateShortageAlertsAsync()
        {
            var today = DateTime.Today;
            var products = await _context.Products.AsNoTracking()
                .Where(p => !p.IsDeleted)
                .ToListAsync();

            var locations = await _context.Locations.AsNoTracking()
                .Where(l => !l.IsDeleted)
                .ToListAsync();

            var balances = await _context.BatchesOutsideRecall
                .Where(batch => !batch.IsDeleted && !batch.IsQuarantined && batch.ExpiryDate >= today)
                .GroupBy(batch => new { batch.ProductId, batch.LocationId })
                .Select(group => new { group.Key, Quantity = group.Sum(batch => batch.Quantity - batch.ReservedQuantity) })
                .ToDictionaryAsync(row => (row.Key.ProductId, row.Key.LocationId), row => row.Quantity);
            var alerts = await _context.ShortageAlerts
                .Where(alert => !alert.IsDeleted && !alert.IsResolved)
                .ToListAsync();
            var activeAlerts = alerts.ToLookup(alert => (alert.ProductId, alert.LocationId));
            var rules = await _context.ReorderRules.ToDictionaryAsync(item => (item.ProductId, item.LocationId), item => item.Minimum);
            foreach (var product in products)
            {
                foreach (var location in locations)
                {
                    var key = (product.Id, location.Id);
                    var totalStock = balances.GetValueOrDefault(key);
                    var minimum = rules.GetValueOrDefault(key, product.MinStock);
                    var shortage = totalStock <= minimum;
                    foreach (var alert in activeAlerts[key])
                    {
                        alert.CurrentQuantity = totalStock;
                        alert.MinStock = minimum;
                        alert.IsResolved = !shortage;
                        alert.UpdatedAt = DateTime.UtcNow;
                    }

                    if (!shortage || activeAlerts.Contains(key)) continue;
                    _context.ShortageAlerts.Add(new ShortageAlert
                    {
                        ProductId = product.Id,
                        LocationId = location.Id,
                        CurrentQuantity = totalStock,
                        MinStock = minimum
                    });
                }
            }

            await _context.SaveChangesAsync();
        }
    }
}
