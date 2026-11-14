// ============================================================
// ILocationRepository.cs
// ------------------------------------------------------------
// Purpose: Interface defining the contract for Location data access.
//
// Structure: 1 method signature:
//   - GetAllAsync() — all non-deleted locations, ordered by Id.
//
// Architecture note (consistency pass): this interface is new.
// LocationsController previously injected AppDbContext directly and
// ran this exact query inline — the query itself is unchanged, just
// moved behind a repository so LocationsController follows the same
// Controller -> Repository pattern already used by Products, Inventory,
// and Sales. Only one method exists because LocationsController only
// ever had one read-only endpoint (no create/update/delete route for
// locations exists anywhere in the API).
//
// Implemented by: LocationRepository.cs (the only implementation).
// Registered in Program.cs via:
//   builder.Services.AddScoped<ILocationRepository, LocationRepository>();
// ============================================================
using PharmacyAPI.Models;

namespace PharmacyAPI.Repositories
{
    public interface ILocationRepository
    {
        Task<IEnumerable<Location>> GetAllAsync();
    }
}
