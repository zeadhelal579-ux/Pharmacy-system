// ============================================================
// InventoryRepository.cs
// ------------------------------------------------------------
// Purpose: Concrete EF Core implementation of IInventoryRepository.
//
// Structure:
//   1. Constructor (top) — injects AppDbContext.
//   2. GetBatchesByLocationAsync — batches at one location,
//      excludes soft-deleted and zero-quantity rows, includes
//      Product, ordered by ExpiryDate (oldest first).
//   3. GetBatchesByProductAsync — same filtering, across all
//      locations for one product, no Product include here (caller
//      already knows the product).
//   4. GetOldestBatchAsync — the single earliest-expiry batch with
//      stock > 0 for one product at one location. This is the core
//      FIFO lookup used by InventoryService for both selling and
//      transferring.
//   5. AddBatchAsync — inserts and immediately calls SaveChangesAsync.
//   6. UpdateBatchAsync — sets UpdatedAt, then immediately calls
//      SaveChangesAsync.
//   7. GetTotalStockAsync — SUM of Quantity across all non-deleted
//      batches for one product/location pair (includes batches with
//      quantity 0, unlike the other queries — used for reporting the
//      true total, not just "available to sell").
//
// IMPORTANT: AddBatchAsync and UpdateBatchAsync each call
// SaveChangesAsync() immediately on their own. This is why
// InventoryService.SellProductInternalAsync and
// TransferProductInternalAsync (reviewed later in Services) must
// NOT call these two repository methods when running inside a
// larger multi-step transaction — they bypass the repository and
// use _context.Batches.Update()/AddAsync() directly instead, only
// calling SaveChangesAsync once at the very end.
//
// Consumed by: InventoryController (all 4 read endpoints + AddBatch),
// InventoryService (GetOldestBatchAsync only, for FIFO logic).
// ============================================================
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Repositories
{
    public class InventoryRepository : IInventoryRepository
    {
        private readonly AppDbContext _context;

        public InventoryRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<Batch>> GetBatchesByLocationAsync(int locationId, bool includeEmpty = false)
        {
            return await _context.Batches
                .Where(b => b.LocationId == locationId && !b.IsDeleted && (includeEmpty || b.Quantity > 0))
                .Include(b => b.Product)
                .OrderBy(b => b.ExpiryDate)
                .ToListAsync();
        }

        public async Task<IEnumerable<Batch>> GetBatchesByProductAsync(int productId, int? locationId)
        {
            return await _context.Batches
                .Where(b => b.ProductId == productId && !b.IsDeleted && b.Quantity > 0 &&
                    (!locationId.HasValue || b.LocationId == locationId.Value))
                .OrderBy(b => b.ExpiryDate)
                .ToListAsync();
        }

        public async Task<Batch?> GetOldestBatchAsync(int productId, int locationId)
        {
            return await _context.Batches
                .Where(b => b.ProductId == productId &&
                            b.LocationId == locationId &&
                            !b.IsDeleted &&
                            b.Quantity > 0)
                .OrderBy(b => b.ExpiryDate)
                .FirstOrDefaultAsync();
        }

        public async Task AddBatchAsync(Batch batch)
        {
            await _context.Batches.AddAsync(batch);
            await _context.SaveChangesAsync();
        }

        public async Task UpdateBatchAsync(Batch batch)
        {
            batch.UpdatedAt = DateTime.Now;
            _context.Batches.Update(batch);
            await _context.SaveChangesAsync();
        }

        public async Task<int> GetTotalStockAsync(int productId, int locationId)
        {
            var today = DateTime.Today;
            return await _context.BatchesOutsideRecall
                .Where(b => b.ProductId == productId &&
                            b.LocationId == locationId &&
                            !b.IsDeleted && !b.IsQuarantined && b.ExpiryDate >= today)
                .SumAsync(b => b.Quantity - b.ReservedQuantity);
        }
    }
}
