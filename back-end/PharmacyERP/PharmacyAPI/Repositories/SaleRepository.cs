// ============================================================
// SaleRepository.cs
// ------------------------------------------------------------
// Purpose: Concrete EF Core implementation of ISaleRepository.
//
// Structure:
//   1. Constructor (top) — injects AppDbContext.
//   2. GetAllAsync — all non-deleted sales, with Location, User,
//      and SaleItems.Product all eagerly loaded via .Include()/
//      .ThenInclude(), ordered newest-first.
//   3. GetByLocationAsync — same includes and ordering, filtered
//      to one specific location.
//   4. GetByIdAsync — same includes, filtered to one specific Id,
//      nullable return.
//   5. AddAsync — inserts and immediately calls SaveChangesAsync.
//
// Note: the repeated .Include(s => s.Location).Include(s => s.User)
// .Include(s => s.SaleItems).ThenInclude(si => si.Product) chain is
// duplicated across all 3 read methods rather than factored into a
// shared private helper — minor repetition, no functional issue.
//
// Consumed by: SalesController (GetAll, GetByLocation, GetById).
// AddAsync is NOT called directly by SalesController — SalesService
// bypasses this repository entirely for CreateSaleAsync, writing to
// _context.Sales directly instead, because it needs the insert to
// participate in the same transaction as the inventory deduction
// (see the Services folder review coming up next).
// ============================================================
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Repositories
{
    public class SaleRepository : ISaleRepository
    {
        private readonly AppDbContext _context;

        public SaleRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<Sale>> GetAllAsync()
        {
            return await _context.Sales
                .Where(s => !s.IsDeleted)
                .Include(s => s.Location)
                .Include(s => s.User)
                .Include(s => s.SaleItems)
                .ThenInclude(si => si.Product)
                .OrderByDescending(s => s.CreatedAt)
                .ToListAsync();
        }

        public async Task<IEnumerable<Sale>> GetByLocationAsync(int locationId)
        {
            return await _context.Sales
                .Where(s => s.LocationId == locationId && !s.IsDeleted)
                .Include(s => s.Location)
                .Include(s => s.User)
                .Include(s => s.SaleItems)
                .ThenInclude(si => si.Product)
                .OrderByDescending(s => s.CreatedAt)
                .ToListAsync();
        }

        public async Task<Sale?> GetByIdAsync(int id)
        {
            return await _context.Sales
                .Where(s => s.Id == id && !s.IsDeleted)
                .Include(s => s.Location)
                .Include(s => s.User)
                .Include(s => s.SaleItems)
                .ThenInclude(si => si.Product)
                .FirstOrDefaultAsync();
        }

        public async Task AddAsync(Sale sale)
        {
            await _context.Sales.AddAsync(sale);
            await _context.SaveChangesAsync();
        }
    }
}