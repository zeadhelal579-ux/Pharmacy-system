// ============================================================
// UsersController.cs
// ------------------------------------------------------------
// Purpose: Full CRUD for staff accounts (Users table).
//
// Structure:
//   1. No [Authorize] on the class itself — each method has its
//      own attribute, because Create must stay open (see note below).
//   2. Constructor (top) — injects IUserRepository.
//   3. GET / and GET {id} — [Authorize(Roles = "SuperAdmin")] only.
//   4. POST / (Create) — deliberately has NO [Authorize] attribute.
//      This is required so the very first user in a fresh database
//      can be created without already having a SuperAdmin token
//      (chicken-and-egg problem). Uses CreateUserDto.
//   5. PUT {id} (Update) — [Authorize(Roles = "SuperAdmin")]. Uses
//      UpdateUserDto (separate from CreateUserDto) because the
//      password field must be optional here — an empty password
//      means "leave it unchanged", handled explicitly in the method
//      body rather than via model binding.
//   6. DELETE {id} — [Authorize(Roles = "SuperAdmin")]. Soft delete only.
//
// Architecture note (consistency pass): this controller previously
// injected AppDbContext directly and ran every query inline — the
// last full-CRUD controller with no repository behind it. It now
// goes through IUserRepository, same shape as ProductsController.
// Password hashing (BCrypt) is unchanged, still happens here.
// Two small, deliberate behavior notes from this pass:
//   - Update/Delete previously loaded the target user via a plain
//     _context.Users.FindAsync(id), which does not filter on
//     IsDeleted (GetAll/GetById already did). They now use
//     GetByIdAsync, which does — matching the filter every other
//     read in this controller already applies. In practice this only
//     changes behavior for the edge case of updating/deleting a user
//     that is already soft-deleted (now correctly 404s instead of
//     silently touching a "deleted" row).
//   - UpdatedAt is now set inside UserRepository.UpdateAsync rather
//     than manually in this controller before calling it — matching
//     how ProductsController already relies on ProductRepository for
//     that, instead of setting it twice.
//
// SECURITY NOTE: because Create has no [Authorize], anyone can
// currently call POST /api/users and create a SuperAdmin account.
// This is acceptable only for local development. Before any real
// deployment, this must be replaced with a one-time "first admin
// setup" endpoint that locks itself after the Users table has at
// least one row.
//
// Consumed by: users.js (full CRUD, minus the id filter used
// internally by GetById which is called via CreatedAtAction).
// ============================================================
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyAPI.DTOs.Users;
using PharmacyAPI.Models;
using PharmacyAPI.Repositories;
using PharmacyAPI.Data;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace PharmacyAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UsersController : ControllerBase
    {
        private readonly IUserRepository _userRepository;
        private readonly AppDbContext _context;

        public UsersController(IUserRepository userRepository, AppDbContext context)
        {
            _userRepository = userRepository;
            _context = context;
        }

        [Authorize(Roles = "SuperAdmin")]
        [HttpGet("roles")]
        public async Task<IActionResult> Roles(CancellationToken cancellationToken) =>
            Ok(await _context.Roles.AsNoTracking().Where(role => !role.IsDeleted)
                .OrderBy(role => role.Name).Select(role => new { role.Id, role.Name })
                .ToListAsync(cancellationToken));

        [Authorize(Roles = "SuperAdmin")]
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var users = await _userRepository.GetAllAsync();
            return Ok(users);
        }

        [Authorize(Roles = "SuperAdmin")]
        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var user = await _userRepository.GetByIdAsync(id);
            if (user == null) return NotFound();
            return Ok(user);
        }

        [Authorize(Roles = "SuperAdmin")]
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateUserDto dto)
        {
            if (!await ValidAccountAsync(null, dto.Name, dto.Email, dto.RoleId, dto.LocationId) ||
                !ValidPassword(dto.PasswordHash))
                return BadRequest(new { message = "Invalid account details or email already in use" });
            var user = new User
            {
                Name = dto.Name.Trim(),
                Email = dto.Email.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.PasswordHash),
                RoleId = dto.RoleId,
                LocationId = dto.LocationId
            };

            await _userRepository.AddAsync(user);
            return CreatedAtAction(nameof(GetById), new { id = user.Id }, user);
        }

        [Authorize(Roles = "SuperAdmin")]
        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] UpdateUserDto dto)
        {
            var user = await _userRepository.GetByIdAsync(id);
            if (user == null) return NotFound();
            if (IsCaller(id) && (user.RoleId != dto.RoleId || user.LocationId != dto.LocationId))
                return BadRequest(new { message = "You cannot change your own role or location" });
            if (!await ValidAccountAsync(id, dto.Name, dto.Email, dto.RoleId, dto.LocationId) ||
                (!string.IsNullOrEmpty(dto.PasswordHash) && !ValidPassword(dto.PasswordHash)))
                return BadRequest(new { message = "Invalid account details or email already in use" });

            user.Name = dto.Name.Trim();
            user.Email = dto.Email.Trim();
            user.RoleId = dto.RoleId;
            user.LocationId = dto.LocationId;
            if (!string.IsNullOrEmpty(dto.PasswordHash))
            {
                user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.PasswordHash);
            }

            await _userRepository.UpdateAsync(user);
            return NoContent();
        }

        [Authorize(Roles = "SuperAdmin")]
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            if (IsCaller(id)) return BadRequest(new { message = "You cannot disable your own account" });
            var user = await _userRepository.GetByIdAsync(id);
            if (user == null) return NotFound();

            await _userRepository.DeleteAsync(id);
            return NoContent();
        }

        private bool IsCaller(int id) => User.FindFirstValue(ClaimTypes.NameIdentifier) == id.ToString();

        private async Task<bool> ValidAccountAsync(int? id, string name, string email, int role, int location) =>
            !string.IsNullOrWhiteSpace(name) && name.Length <= 150 &&
            !string.IsNullOrWhiteSpace(email) && email.Length <= 254 &&
            new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(email.Trim()) &&
            await _context.Roles.AnyAsync(item => item.Id == role && !item.IsDeleted) &&
            await _context.Locations.AnyAsync(item => item.Id == location && !item.IsDeleted) &&
            !await _context.Users.AnyAsync(item => item.Id != id && !item.IsDeleted && item.Email == email.Trim());

        private static bool ValidPassword(string password) =>
            password.Length >= 12 && System.Text.Encoding.UTF8.GetByteCount(password) <= 72;
    }
}
