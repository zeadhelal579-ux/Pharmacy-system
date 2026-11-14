// ============================================================
// IUserRepository.cs
// ------------------------------------------------------------
// Purpose: Interface defining the contract for User data access.
//
// Structure: 5 method signatures, all async, mirroring
// IProductRepository's shape (minus GetByBarcodeAsync, which has
// no User equivalent):
//   - GetAllAsync() — non-deleted users, with Role + Location included
//   - GetByIdAsync(id) — nullable return, same includes
//   - AddAsync(user)
//   - UpdateAsync(user)
//   - DeleteAsync(id) — soft delete only, despite the name
//
// Architecture note (consistency pass): this interface is new.
// UsersController previously injected AppDbContext directly and ran
// all of its queries inline — the queries themselves are unchanged,
// just moved behind a repository so Users follows the same
// Controller -> Repository pattern already used by Products.
// Password hashing (BCrypt) stays in UsersController, unchanged —
// it is request-handling logic, not data access.
//
// Implemented by: UserRepository.cs (the only implementation).
// Registered in Program.cs via:
//   builder.Services.AddScoped<IUserRepository, UserRepository>();
// ============================================================
using PharmacyAPI.Models;

namespace PharmacyAPI.Repositories
{
    public interface IUserRepository
    {
        Task<IEnumerable<User>> GetAllAsync();
        Task<User?> GetByIdAsync(int id);
        Task AddAsync(User user);
        Task UpdateAsync(User user);
        Task DeleteAsync(int id);
    }
}
