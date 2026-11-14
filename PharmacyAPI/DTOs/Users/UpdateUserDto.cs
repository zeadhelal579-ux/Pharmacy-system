// ============================================================
// UpdateUserDto.cs
// ------------------------------------------------------------
// Purpose: Request shape for updating an existing User.
//
// Structure: same fields as CreateUserDto, EXCEPT PasswordHash is
// nullable (string?) here, not required. An empty/null value means
// "leave the password unchanged" — handled explicitly in
// UsersController.Update, which only re-hashes and overwrites the
// password if this field is non-empty.
//
// Consumed by: UsersController.Update([FromBody] UpdateUserDto dto).
// Sent by: users.js's handleFormSubmit, when isEditMode is true.
// ============================================================
namespace PharmacyAPI.DTOs.Users
{
    public class UpdateUserDto
    {
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? PasswordHash { get; set; }
        public int RoleId { get; set; }
        public int LocationId { get; set; }
    }
}