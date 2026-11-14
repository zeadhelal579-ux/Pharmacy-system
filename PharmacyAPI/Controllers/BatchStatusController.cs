// Changes batch availability and records the operator's decision.
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Controllers;

[ApiController, Route("api/inventory/batches/{id:int}/status")]
[Authorize(Roles = "SuperAdmin,BranchManager,WarehouseAdmin")]
public sealed class BatchStatusController(AppDbContext context, TimeProvider clock) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> History(int id, CancellationToken token)
    {
        var scope = User.Scope();
        if (!await context.Batches.AnyAsync(batch => batch.Id == id &&
            (scope == null || batch.LocationId == scope), token)) return NotFound();
        return Ok(await context.BatchStatusChanges.AsNoTracking().Where(change => change.BatchId == id)
            .OrderByDescending(change => change.Id).Take(100)
            .Select(change => new { change.Id, change.Quarantined, change.Reason, change.UserId, change.CreatedAt })
            .ToListAsync(token));
    }

    [HttpPost]
    public async Task<IActionResult> Change(int id, BatchStatusInput input, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(input.Reason)) return BadRequest();
        if (!input.Quarantined && User.IsInRole("WarehouseAdmin")) return Forbid();
        var scope = User.Scope();
        var batch = await context.Batches.SingleOrDefaultAsync(item => item.Id == id &&
            !item.IsDeleted && (scope == null || item.LocationId == scope), token);
        if (batch is null) return NotFound();

        var now = clock.GetUtcNow();
        if (!input.Quarantined && await context.ActiveLotRecalls.AnyAsync(recall =>
            recall.ProductId == batch.ProductId && recall.Lot == batch.BatchNumber, token))
            return Conflict(new { message = "Close the active recall before reviewing release" });
        if (!input.Quarantined && (batch.ExpiryDate < clock.GetLocalNow().Date || batch.Quantity <= 0 ||
            !await context.Products.AnyAsync(product => product.Id == batch.ProductId && !product.IsDeleted, token)))
            return Conflict(new { message = "Expired, empty or archived stock cannot be released" });
        if (batch.IsQuarantined == input.Quarantined) return Ok(new { batch.IsQuarantined });
        batch.IsQuarantined = input.Quarantined;
        batch.UpdatedAt = now.UtcDateTime;
        context.BatchStatusChanges.Add(new BatchStatusChange
        {
            BatchId = id, Quarantined = input.Quarantined, Reason = input.Reason.Trim(),
            UserId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), CreatedAt = now
        });
        try
        {
            await context.SaveChangesAsync(token);
            return Ok(new { batch.IsQuarantined });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Stock changed. Reload and try again." });
        }
    }
}

public sealed record BatchStatusInput([Required] bool? IsQuarantined, [Required, MaxLength(500)] string Reason)
{
    public bool Quarantined => IsQuarantined.GetValueOrDefault();
}
