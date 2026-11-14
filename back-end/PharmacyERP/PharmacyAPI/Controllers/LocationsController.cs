// ============================================================
// LocationsController.cs
// ------------------------------------------------------------
// Purpose: Read-only endpoint that returns all active branches
// and the central warehouse. Added later to replace hardcoded
// location arrays that used to live in the frontend JS files.
//
// Structure:
//   1. [Authorize] on the class — any logged-in user can call this.
//   2. Constructor (top) — injects ILocationRepository.
//   3. GET api/locations — the only endpoint. Returns all Locations
//      where IsDeleted = false, ordered by Id.
//
// Architecture note (consistency pass): this controller previously
// injected AppDbContext directly and ran the query inline — the one
// spot in the whole read path with no repository behind it. It now
// goes through ILocationRepository like every other read-only
// controller in the project. Same query, same response shape, no
// behavior change.
//
// Consumed by: inventory.js and pos.js via api.locations.getAll().
// NOTE: transfers.js and users.js still use an old hardcoded
// LOCATIONS array instead of calling this endpoint — that's a
// frontend inconsistency to fix when we reach those files, not
// a backend issue.
// ============================================================
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyAPI.Repositories;

namespace PharmacyAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class LocationsController : ControllerBase
    {
        private readonly ILocationRepository _locationRepository;

        public LocationsController(ILocationRepository locationRepository)
        {
            _locationRepository = locationRepository;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var locations = await _locationRepository.GetAllAsync();
            return Ok(locations);
        }
    }
}
