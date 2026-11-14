// ============================================================
// AuthService.cs
// ------------------------------------------------------------
// Purpose: Handles credential verification and JWT token generation
// for login. This is the only place in the entire project that
// creates a JWT.
//
// Structure:
//   1. Constructor (top) — injects AppDbContext and IConfiguration
//      (used to read the Jwt:Key from appsettings.json).
//   2. LoginAsync(email, password) — looks up the User by Email
//      (with Role included), returns null if not found, then
//      verifies the password with BCrypt.Verify against the stored
//      PasswordHash. Returns null on any failure — AuthController
//      turns that into a 401.
//   3. GenerateToken(user) [private] — builds the JWT:
//        - Signing key: HMAC-SHA256, built from Jwt:Key in
//          appsettings.json (falls back to a hardcoded default if
//          missing — fine for dev, would need hardening for
//          production).
//        - Claims: NameIdentifier (user.Id), Email, Role
//          (user.Role.Name), and a custom "LocationId" claim.
//        - Expiry: 8 hours from generation time.
//
// Consumed by: AuthController.Login.
// Frontend dependency: login.html decodes ALL FOUR of these claims
// out of the JWT payload directly (via atob/JSON.parse on the
// token's middle segment) to build its local "user" object — it
// never calls a separate "/me" endpoint. This means any change to
// claim names or types here must be mirrored exactly in login.html's
// decoding logic.
// ============================================================
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PharmacyAPI.Data;
using PharmacyAPI.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace PharmacyAPI.Services
{
    public class AuthService
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;

        public AuthService(AppDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        public async Task<string?> LoginAsync(string email, string password)
        {
            var user = await _context.Users
                .Include(u => u.Role)
                .FirstOrDefaultAsync(u => u.Email == email && !u.IsDeleted &&
                    !u.Role.IsDeleted && !u.Location.IsDeleted);

            if (user == null) return null;
            if (!BCrypt.Net.BCrypt.Verify(password, user.PasswordHash)) return null;

            return GenerateToken(user);
        }

        private string GenerateToken(User user)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
                _configuration["Jwt:Key"]!));

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Role, user.Role.Name),
                new Claim("LocationId", user.LocationId.ToString())
            };

            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.Now.AddHours(8),
                signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256)
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
