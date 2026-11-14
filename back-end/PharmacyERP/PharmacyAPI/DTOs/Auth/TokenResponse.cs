// ============================================================
// TokenResponse.cs
// ------------------------------------------------------------
// Purpose: Intended response shape for the login endpoint,
// bundling the JWT token together with basic user info.
//
// Structure: Token, Email, Role (all strings), LocationId (int).
//
// STATUS: currently unused. AuthController.Login returns an
// anonymous object { token } instead of this class. Kept here as
// scaffolding in case the login response is later expanded to
// include Email/Role/LocationId directly in the JSON body instead
// of requiring the frontend to decode them from the JWT payload
// itself (which is what login.html currently does).
// ============================================================
namespace PharmacyAPI.DTOs.Auth
{
    public class TokenResponse
    {
        public string Token { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public int LocationId { get; set; }
    }
}