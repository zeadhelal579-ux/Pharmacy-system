// ============================================================
// DashboardService.cs
// ------------------------------------------------------------
// Purpose: Builds the aggregate statistics payload for the main
// dashboard screen — the one place in the system that reads across
// six different entities (Products, Sales, Locations, TransferRequests,
// ShortageAlerts, Batches) for a single response.
//
// Structure:
//   1. Constructor (top) — injects AppDbContext directly. There is
//      no single entity this aggregation belongs to, so — like
//      ReportService's shortage-scan and InventoryService's FIFO
//      logic — it talks to AppDbContext directly rather than through
//      a per-entity repository; that pattern is already established
//      for cross-cutting service-layer logic in this project.
//   2. GetStatsAsync(locationId) — the 6 stat queries, each
//      conditionally filtered by locationId when provided (null means
//      company-wide, used for SuperAdmin). totalLocations always stays
//      a global count regardless of the filter — the number of
//      branches/warehouses that exist isn't sensitive per-branch data.
//      Logic is unchanged from the original inline version; only its
//      location moved.
//
// Architecture note (consistency pass): this service is new.
// DashboardController previously injected AppDbContext directly and
// ran all 6 queries inline — the only controller in the project with
// business logic but no service layer behind it at all. The queries
// are unchanged, just relocated here; DashboardController now only
// reads the caller's claims (still a controller-level concern) and
// passes the resolved locationId in as a plain parameter, the same
// way ReportsController already passes locationId into ReportService.
//
// Consumed by: DashboardController.GetStats().
// ============================================================
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;

namespace PharmacyAPI.Services
{
    public class DashboardService
    {
        private readonly AppDbContext _context;

        public DashboardService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<object> GetStatsAsync(int? locationId)
        {
            var productsQuery = _context.Products.Where(p => !p.IsDeleted);
            var totalProducts = await productsQuery.CountAsync();

            var salesQuery = _context.Sales
                .Where(s => !s.IsDeleted && s.CreatedAt.Date == DateTime.Today);
            if (locationId.HasValue) salesQuery = salesQuery.Where(s => s.LocationId == locationId.Value);
            var totalSalesToday = await salesQuery.SumAsync(s => (decimal?)s.TotalAmount) ?? 0;

            var totalLocations = await _context.Locations.CountAsync(l => !l.IsDeleted);

            var transfersQuery = _context.TransferRequests
                .Where(t => t.Status == "Pending" && !t.IsDeleted);
            if (locationId.HasValue)
                transfersQuery = transfersQuery.Where(t => t.FromLocationId == locationId.Value || t.ToLocationId == locationId.Value);
            var pendingTransfers = await transfersQuery.CountAsync();

            var shortagesQuery = _context.ShortageAlerts
                .Where(s => !s.IsResolved && !s.IsDeleted);
            if (locationId.HasValue) shortagesQuery = shortagesQuery.Where(s => s.LocationId == locationId.Value);
            var shortageAlerts = await shortagesQuery.CountAsync();

            var expiringQuery = _context.Batches
                .Where(b => !b.IsDeleted && b.Quantity > 0 && b.ExpiryDate <= DateTime.Now.AddDays(90));
            if (locationId.HasValue) expiringQuery = expiringQuery.Where(b => b.LocationId == locationId.Value);
            var expiringBatches = await expiringQuery.CountAsync();

            return new
            {
                totalProducts,
                totalSalesToday,
                totalLocations,
                pendingTransfers,
                shortageAlerts,
                expiringBatches
            };
        }
    }
}
