// ============================================================
// UserRepository.cs
// ------------------------------------------------------------
// Purpose: Concrete EF Core implementation of IUserRepository.
//
// Structure:
//   1. Constructor (top) — injects AppDbContext.
//   2. GetAllAsync — non-deleted users, with Role + Location included.
//      Identical query to what UsersController.GetAll ran directly
//      against AppDbContext before this consistency pass.
//   3. GetByIdAsync — single user by Id, same includes, nullable
//      return, filtered on !IsDeleted (matches the controller's
//      original GetById query).
//   4. AddAsync — inserts and immediately calls SaveChangesAsync,
//      same shape as ProductRepository.AddAsync.
//   5. UpdateAsync — sets UpdatedAt, then immediately calls
//      SaveChangesAsync, same shape as ProductRepository.UpdateAsync.
//   6. DeleteAsync — soft delete via GetByIdAsync + UpdateAsync,
//      same composition pattern as ProductRepository.DeleteAsync.
//
// Consumed by: UsersController (GetAll, GetById, Create, Update, Delete).
// ============================================================
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Repositories
{
    public class UserRepository : IUserRepository
    {
        private readonly AppDbContext _context;

        public UserRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<User>> GetAllAsync()
        {
            return await _context.Users
                .Where(u => !u.IsDeleted)
                .Include(u => u.Role)
                .Include(u => u.Location)
                .ToListAsync();
        }

        public async Task<User?> GetByIdAsync(int id)
        {
            return await _context.Users
                .Include(u => u.Role)
                .Include(u => u.Location)
                .FirstOrDefaultAsync(u => u.Id == id && !u.IsDeleted);
        }

        public async Task AddAsync(User user)
        {
            await _context.Users.AddAsync(user);
            await _context.SaveChangesAsync();
        }

        public async Task UpdateAsync(User user)
        {
            user.UpdatedAt = DateTime.Now;
            _context.Users.Update(user);
            await _context.SaveChangesAsync();
        }

        public async Task DeleteAsync(int id)
        {
            var user = await GetByIdAsync(id);
            if (user != null)
            {
                user.IsDeleted = true;
                await UpdateAsync(user);
            }
        }
    }
}
