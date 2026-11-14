// ============================================================
// DashboardController.cs
// ------------------------------------------------------------
// Purpose: Single-endpoint controller that returns aggregate
// statistics for the main dashboard screen.
//
// SECURITY CHANGE: every stat is filtered by the caller's own
// LocationId, unless the caller is SuperAdmin (sees everything).
// A Cashier/BranchManager/WarehouseAdmin only sees their own
// branch's/warehouse's numbers, never company-wide totals.
//
// Structure:
//   1. [Authorize] on the class.
//   2. Constructor — injects DashboardService.
//   3. GET / — resolves the caller's location filter from their JWT
//      claims (role + LocationId), then delegates the 6 stat queries
//      to DashboardService.GetStatsAsync. totalLocations stays a
//      global count regardless of role — the number of branches/
//      warehouses that exist isn't sensitive per-branch data, it's
//      just company structure.
//
// Architecture note (consistency pass): this controller previously
// injected AppDbContext directly and ran all 6 stat queries inline —
// the only controller in the project with real business logic but no
// service layer behind it. It now delegates to DashboardService,
// consistent with every other controller that has more than a single
// pass-through query. Claim-reading (GetLocationFilter) stays here,
// same as the equivalent helper methods in SalesController and
// TransfersController — only the resolved value crosses into the
// service layer, not the ClaimsPrincipal itself.
//
// Consumed by: dashboard.js via api.dashboard.getStats().
// ============================================================
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyAPI.Services;
using System.Security.Claims;

namespace PharmacyAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class DashboardController : ControllerBase
    {
        private readonly DashboardService _dashboardService;

        public DashboardController(DashboardService dashboardService)
        {
            _dashboardService = dashboardService;
        }

        [HttpGet]
        public async Task<IActionResult> GetStats()
        {
            var locationId = GetLocationFilter();
            var stats = await _dashboardService.GetStatsAsync(locationId);
            return Ok(stats);
        }

        private int? GetLocationFilter()
        {
            var role = User.FindFirst(ClaimTypes.Role)?.Value;
            if (role == "SuperAdmin") return null;

            var locationClaim = User.FindFirst("LocationId")?.Value;
            return int.Parse(locationClaim!);
        }
    }
}
