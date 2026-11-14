// ============================================================
// LocationRepository.cs
// ------------------------------------------------------------
// Purpose: Concrete EF Core implementation of ILocationRepository.
//
// Structure:
//   1. Constructor (top) — injects AppDbContext.
//   2. GetAllAsync — all non-deleted locations, ordered by Id.
//      Identical query to what LocationsController.GetAll ran
//      directly against AppDbContext before this consistency pass.
//
// Consumed by: LocationsController (GetAll).
// ============================================================
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Repositories
{
    public class LocationRepository : ILocationRepository
    {
        private readonly AppDbContext _context;

        public LocationRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<Location>> GetAllAsync()
        {
            return await _context.Locations
                .Where(l => !l.IsDeleted)
                .OrderBy(l => l.Id)
                .ToListAsync();
        }
    }
}
