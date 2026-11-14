// ============================================================
// AuthController.cs
// ------------------------------------------------------------
// Purpose: Handles user login and JWT token issuance.
// This is the ONLY controller that must remain fully anonymous
// (no [Authorize] attribute anywhere in this file) — every other
// endpoint in the system requires a token obtained from here first.
//
// Structure:
//   1. Constructor (top) — injects AuthService via DI (Scoped lifetime).
//   2. POST api/auth/login — the single endpoint in this controller.
//      Accepts { email, password } as LoginRequest, delegates the
//      actual credential check + bcrypt verification + JWT generation
//      to AuthService.LoginAsync().
//   3. Returns 401 Unauthorized if credentials are invalid,
//      or 200 OK with { token } if successful.
//
// Architecture note (consistency pass): LoginRequest previously lived
// as an inline class at the bottom of this file, duplicating the
// already-scaffolded DTOs/Auth/LoginRequest.cs (identical fields).
// This controller now binds to that shared DTO instead — same accepted
// request shape, no behavior change, one less duplicate definition.
//
// Consumed by: login.html on the frontend, via api.auth.login(email, password).
// ============================================================
using Microsoft.AspNetCore.Mvc;
using PharmacyAPI.DTOs.Auth;
using PharmacyAPI.Services;

namespace PharmacyAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AuthService _authService;

        public AuthController(AuthService authService)
        {
            _authService = authService;
        }

        [Microsoft.AspNetCore.Authorization.Authorize]
        [HttpGet("session")]
        public IActionResult GetSession()
        {
            return Ok(new
            {
                userId = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value),
                email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value,
                role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value,
                locationId = int.Parse(User.FindFirst("LocationId")!.Value)
            });
        }

        [HttpPost("login")]
        [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("SignIn")]
        [Microsoft.AspNetCore.Authorization.AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var token = await _authService.LoginAsync(request.Email, request.Password);
            if (token == null)
                return Unauthorized(new { message = "Invalid email or password" });

            return Ok(new { token });
        }
    }
}
