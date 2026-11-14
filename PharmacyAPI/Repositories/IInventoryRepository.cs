// ============================================================
// IInventoryRepository.cs
// ------------------------------------------------------------
// Purpose: Interface defining the contract for all Batch-related
// data access — kept separate from the implementation so
// InventoryController and InventoryService depend on the
// abstraction, not a concrete EF Core implementation directly.
//
// Structure: 6 method signatures, all async:
//   - GetBatchesByLocationAsync(locationId)
//   - GetBatchesByProductAsync(productId)
//   - GetOldestBatchAsync(productId, locationId) — nullable return,
//     the core of FIFO selling/transferring logic.
//   - AddBatchAsync(batch)
//   - UpdateBatchAsync(batch)
//   - GetTotalStockAsync(productId, locationId)
//
// Implemented by: InventoryRepository.cs (the only implementation).
// Registered in Program.cs via:
//   builder.Services.AddScoped<IInventoryRepository, InventoryRepository>();
// ============================================================
using PharmacyAPI.Models;

namespace PharmacyAPI.Repositories
{
    public interface IInventoryRepository
    {
        Task<IEnumerable<Batch>> GetBatchesByLocationAsync(int locationId, bool includeEmpty = false);
        Task<IEnumerable<Batch>> GetBatchesByProductAsync(int productId, int? locationId);
        Task<Batch?> GetOldestBatchAsync(int productId, int locationId);
        Task AddBatchAsync(Batch batch);
        Task UpdateBatchAsync(Batch batch);
        Task<int> GetTotalStockAsync(int productId, int locationId);
    }
}
