// ============================================================
// LoginRequest.cs
// ------------------------------------------------------------
// Purpose: Request shape for POST /api/auth/login.
//
// Structure: two plain string properties, Email and Password,
// both defaulting to string.Empty (never null).
//
// Consumed by: AuthController.Login([FromBody] LoginRequest request).
// Sent by: login.html's inline script, via api.auth.login(email, password).
// ============================================================
namespace PharmacyAPI.DTOs.Auth
{
    public class LoginRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }
}