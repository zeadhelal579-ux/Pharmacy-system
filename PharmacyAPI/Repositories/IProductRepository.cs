// ============================================================
// IProductRepository.cs
// ------------------------------------------------------------
// Purpose: Interface defining the contract for all Product-related
// data access.
//
// Structure: 6 method signatures, all async:
//   - GetAllAsync()
//   - GetByIdAsync(id) — nullable return
//   - GetByBarcodeAsync(barcode) — nullable return, used by the
//     barcode-scanner flow
//   - AddAsync(product)
//   - UpdateAsync(product)
//   - DeleteAsync(id) — soft delete only, despite the name
//
// Implemented by: ProductRepository.cs (the only implementation).
// Registered in Program.cs via:
//   builder.Services.AddScoped<IProductRepository, ProductRepository>();
// ============================================================
using PharmacyAPI.Models;

namespace PharmacyAPI.Repositories
{
    public interface IProductRepository
    {
        Task<IEnumerable<Product>> GetAllAsync();
        Task<Product?> GetByIdAsync(int id);
        Task<Product?> GetByBarcodeAsync(string barcode);
        Task AddAsync(Product product);
        Task UpdateAsync(Product product);
        Task DeleteAsync(int id);
    }
}