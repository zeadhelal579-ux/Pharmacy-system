// ============================================================
// ISaleRepository.cs
// ------------------------------------------------------------
// Purpose: Interface defining the contract for all Sale-related
// read/write data access.
//
// Structure: 4 method signatures, all async:
//   - GetAllAsync()
//   - GetByLocationAsync(locationId)
//   - GetByIdAsync(id) — nullable return
//   - AddAsync(sale)
//
// Implemented by: SaleRepository.cs (the only implementation).
// Registered in Program.cs via:
//   builder.Services.AddScoped<ISaleRepository, SaleRepository>();
//
// Note: no UpdateAsync or DeleteAsync here — sales are
// write-once/read-many in this system; there's no UI or endpoint
// to edit or soft-delete a completed sale anywhere in the project.
// ============================================================
using PharmacyAPI.Models;

namespace PharmacyAPI.Repositories
{
    public interface ISaleRepository
    {
        Task<IEnumerable<Sale>> GetAllAsync();
        Task<IEnumerable<Sale>> GetByLocationAsync(int locationId);
        Task<Sale?> GetByIdAsync(int id);
        Task AddAsync(Sale sale);
    }
}