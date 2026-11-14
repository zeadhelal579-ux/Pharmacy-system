// ============================================================
// User.cs
// ------------------------------------------------------------
// Purpose: EF Core entity representing one staff account —
// login credentials plus role and assigned location.
//
// Structure:
//   - Scalar fields: Id, Name, Email (unique in DB), PasswordHash
//     (always stores a BCrypt hash, never plaintext — hashing
//     happens in UsersController before this object is saved),
//     RoleId, LocationId, IsDeleted, CreatedAt, UpdatedAt.
//   - Navigation properties: Role, Location (both required,
//     non-nullable — this is exactly why UsersController.Create
//     and Update need DTOs instead of binding this model directly;
//     see CreateUserDto.cs and UpdateUserDto.cs).
//
// Maps to: the Users table in SQL Server.
// Login flow: AuthService.LoginAsync looks up a User by Email,
// verifies the password with BCrypt.Verify against PasswordHash,
// then reads user.Role.Name and user.LocationId to build the JWT
// claims (NameIdentifier, Email, Role, LocationId).
// Consumed by: UsersController (full CRUD), AuthService (login).
// ============================================================
namespace PharmacyAPI.Models
{
    public class User
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonIgnore]
        public string PasswordHash { get; set; } = string.Empty;
        public int RoleId { get; set; }
        public int LocationId { get; set; }
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;

        public Role Role { get; set; } = null!;
        public Location Location { get; set; } = null!;
    }
}
