// Accepts approval requests and records independent manager decisions.
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.DTOs.Sales;
using PharmacyAPI.Models;
using PharmacyAPI.Services;

namespace PharmacyAPI.Controllers;

[ApiController, Route("api/discounts")]
[Authorize(Roles = "SuperAdmin,BranchManager,Cashier")]
public sealed class DiscountsController(AppDbContext context, TimeProvider clock) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken token)
    {
        var location = User.Scope();
        var userId = UserId;
        var cashier = User.IsInRole("Cashier");
        return Ok(await context.Set<DiscountApproval>().AsNoTracking().Where(item =>
            (location == null || item.LocationId == location) && (!cashier || item.UserId == userId))
            .OrderByDescending(item => item.Id).Take(100).Select(item => new
            {
                item.Id, item.UserId, item.LocationId, item.Amount, item.Reason,
                item.Approved, item.Used, item.DecidedBy, item.DecidedAt
            }).ToListAsync(token));
    }

    [HttpPost]
    public async Task<IActionResult> RequestApproval(DiscountInput input, CancellationToken token)
    {
        if (input.Items.Any(item => item is null) || string.IsNullOrWhiteSpace(input.Reason) ||
            decimal.Round(input.Amount, 2) != input.Amount) return BadRequest();
        var location = int.Parse(User.FindFirstValue("LocationId")!);
        if (!await context.CashShifts.AnyAsync(shift => shift.Id == input.ShiftId &&
            shift.LocationId == location && shift.UserId == UserId && shift.ClosedAt == null, token)) return Conflict();
        var approval = new DiscountApproval
        {
            UserId = UserId, LocationId = location, ShiftId = input.ShiftId, Amount = input.Amount,
            Cart = SalesService.CartFingerprint(input.Items), Reason = input.Reason.Trim(), RequestedAt = clock.GetUtcNow()
        };
        context.Add(approval);
        await context.SaveChangesAsync(token);
        return StatusCode(201, new { approval.Id });
    }

    [HttpPost("{id:int}/decision"), Authorize(Roles = "SuperAdmin,BranchManager")]
    public async Task<IActionResult> Decide(int id, DiscountDecision decision, CancellationToken token)
    {
        var item = await context.Set<DiscountApproval>().FindAsync([id], token);
        if (item is null || !User.CanAccess(item.LocationId)) return NotFound();
        if (item.UserId == UserId) return Forbid();
        if (item.DecidedAt.HasValue) return Conflict();
        item.Approved = decision.Approved;
        item.DecidedAt = clock.GetUtcNow();
        item.DecidedBy = UserId;
        try { await context.SaveChangesAsync(token); }
        catch (DbUpdateConcurrencyException) { return Conflict(); }
        return Ok(new { item.Id });
    }

    private int UserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}

public sealed record DiscountInput([Range(1, int.MaxValue)] int ShiftId,
    [Range(typeof(decimal), "0.01", "1000000")] decimal Amount, [Required, MaxLength(500)] string Reason,
    [Required, MinLength(1), MaxLength(200)] List<SaleItemDto> Items);
public sealed record DiscountDecision(bool Approved);
