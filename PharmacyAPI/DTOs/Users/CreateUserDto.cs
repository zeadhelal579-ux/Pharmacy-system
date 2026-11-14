// ============================================================
// CreateUserDto.cs
// ------------------------------------------------------------
// Purpose: Request shape for creating a new User (staff account).
//
// Structure: Name, Email, PasswordHash (string — despite the name,
// this field receives the PLAINTEXT password from the client; the
// server hashes it with BCrypt before saving, see UsersController.
// Create), RoleId, LocationId (ints).
//
// STATUS: actively used. This is the ONE DTO in the whole project
// that is genuinely wired into its controller — introduced to fix
// a real 400 validation error, since the raw User model has required
// non-nullable Role/Location navigation properties that the client
// never sends.
//
// Consumed by: UsersController.Create([FromBody] CreateUserDto dto).
// Sent by: users.js's handleFormSubmit, when isEditMode is false.
// ============================================================
namespace PharmacyAPI.DTOs.Users
{
    public class CreateUserDto
    {
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public int RoleId { get; set; }
        public int LocationId { get; set; }
    }
}