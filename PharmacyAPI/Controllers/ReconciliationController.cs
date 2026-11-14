// Reconciles sales, cash adjustments, closing balances, and stock movements by location.
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;

namespace PharmacyAPI.Controllers;

[ApiController, Route("api/reports/reconciliation")]
[Authorize(Roles = "SuperAdmin,BranchManager")]
public sealed class ReconciliationController(AppDbContext context) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(DateOnly from, DateOnly through, int? locationId, CancellationToken token)
    {
        if (from == default || through < from || through.DayNumber - from.DayNumber > 92 ||
            through == DateOnly.MaxValue) return BadRequest(new { message = "Provide a range of up to 93 days" });
        if (locationId.HasValue && !User.CanAccess(locationId.Value)) return Forbid();
        var scope = locationId ?? User.Scope();
        // Legacy sales and inventory events use server-local timestamps.
        var start = from.ToDateTime(TimeOnly.MinValue);
        var end = through.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var startInstant = new DateTimeOffset(start, TimeZoneInfo.Local.GetUtcOffset(start));
        var endInstant = new DateTimeOffset(end, TimeZoneInfo.Local.GetUtcOffset(end));

        var sales = await context.Sales.AsNoTracking().Where(item => !item.IsDeleted &&
            item.CreatedAt >= start && item.CreatedAt < end && (scope == null || item.LocationId == scope))
            .GroupBy(item => new { item.LocationId, item.PaymentMethod })
            .Select(group => new { group.Key.LocationId, group.Key.PaymentMethod,
                Count = group.Count(), Amount = group.Sum(item => item.TotalAmount) }).ToListAsync(token);
        var cash = await context.ShiftMovements.AsNoTracking().Where(item =>
            item.CreatedAt >= startInstant && item.CreatedAt < endInstant &&
            (scope == null || item.Shift.LocationId == scope))
            .GroupBy(item => new { item.Shift.LocationId, item.Kind })
            .Select(group => new { group.Key.LocationId, group.Key.Kind,
                Count = group.Count(), Amount = group.Sum(item => item.Amount) }).ToListAsync(token);
        var shifts = await context.CashShifts.AsNoTracking().Where(item =>
            item.ClosedAt >= startInstant && item.ClosedAt < endInstant &&
            (scope == null || item.LocationId == scope))
            .OrderByDescending(item => item.ClosedAt).Select(item => new
            {
                item.Id, item.LocationId, item.UserId, item.OpeningCash, item.ExpectedCash,
                item.ActualCash, Difference = item.ActualCash - item.ExpectedCash, item.CloseNote, item.ClosedAt
            }).ToListAsync(token);
        var stock = await context.InventoryTransactions.AsNoTracking().Where(item => !item.IsDeleted &&
            item.CreatedAt >= start && item.CreatedAt < end &&
            (scope == null || item.FromLocationId == scope || item.ToLocationId == scope))
            .GroupBy(item => item.Type).Select(group => new
            {
                Kind = group.Key, Count = group.Count(), Quantity = group.Sum(item => (long)item.Quantity)
            }).ToListAsync(token);
        return Ok(new { sales, cash, shifts, stock });
    }
}
