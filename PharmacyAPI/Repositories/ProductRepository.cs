// ============================================================
// ProductRepository.cs
// ------------------------------------------------------------
// Purpose: Concrete EF Core implementation of IProductRepository.
//
// Structure:
//   1. Constructor (top) — injects AppDbContext.
//   2. GetAllAsync — all non-deleted products, no filtering beyond that.
//   3. GetByIdAsync — single product by Id, nullable return.
//   4. GetByBarcodeAsync — single product by exact barcode match,
//      nullable return, used by the barcode-scanner flow.
//   5. AddAsync — inserts and immediately calls SaveChangesAsync.
//   6. UpdateAsync — sets UpdatedAt, then immediately calls
//      SaveChangesAsync.
//   7. DeleteAsync — NOT a real delete. Loads the product via
//      GetByIdAsync, sets IsDeleted = true, then calls UpdateAsync
//      (which re-saves it) — a soft delete implemented by
//      composing the two methods above rather than writing raw
//      EF code again.
//
// Consumed by: ProductsController (full CRUD, all 6 methods used).
// ============================================================
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Repositories
{
    public class ProductRepository : IProductRepository
    {
        private readonly AppDbContext _context;

        public ProductRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<Product>> GetAllAsync()
        {
            return await _context.Products
                .Where(p => !p.IsDeleted)
                .ToListAsync();
        }

        public async Task<Product?> GetByIdAsync(int id)
        {
            return await _context.Products
                .FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted);
        }

        public async Task<Product?> GetByBarcodeAsync(string barcode)
        {
            return await _context.Products
                .FirstOrDefaultAsync(p => !p.IsDeleted && (p.Barcode == barcode || p.PackBarcode == barcode));
        }

        public async Task AddAsync(Product product)
        {
            await _context.Products.AddAsync(product);
            await _context.SaveChangesAsync();
        }

        public async Task UpdateAsync(Product product)
        {
            product.UpdatedAt = DateTime.Now;
            _context.Products.Update(product);
            await _context.SaveChangesAsync();
        }

        public async Task DeleteAsync(int id)
        {
            var product = await GetByIdAsync(id);
            if (product != null)
            {
                product.IsDeleted = true;
                await UpdateAsync(product);
            }
        }
    }
}
