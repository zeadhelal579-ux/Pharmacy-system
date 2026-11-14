// Reads operational changes for the chain or the caller's authorized location.
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;

namespace PharmacyAPI.Controllers;

[ApiController, Route("api/reports/audit")]
[Authorize(Roles = "SuperAdmin,BranchManager")]
public sealed class AuditController(AppDbContext context) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(int? locationId, long? beforeId, CancellationToken token)
    {
        if (locationId.HasValue && !User.CanAccess(locationId.Value)) return Forbid();
        var scope = locationId ?? User.Scope();
        return Ok(await context.AuditEvents.AsNoTracking()
            .Where(item => (scope == null || item.LocationId == scope || item.DestinationId == scope) &&
                (beforeId == null || item.Id < beforeId))
            .OrderByDescending(item => item.Id).Take(100).ToListAsync(token));
    }
}
