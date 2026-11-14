// Reconciles cash sales and serializes shift closure against concurrent checkout.
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Services;

public sealed class ShiftService(AppDbContext context, TimeProvider clock)
{
    public Task<ShiftSummary?> CurrentAsync(ShiftOperator actor, CancellationToken cancellationToken) =>
        context.CashShifts.AsNoTracking().Where(shift => shift.UserId == actor.UserId &&
            shift.LocationId == actor.LocationId && shift.ClosedAt == null)
            .Select(shift => new ShiftSummary(shift.Id, shift.OpeningCash, shift.OpenedAt, null, null, null))
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<ShiftSummary?> OpenAsync(
        ShiftOperator actor, decimal openingCash, CancellationToken cancellationToken)
    {
        if (decimal.Round(openingCash, 2) != openingCash) return null;
        var shift = new CashShift
        {
            UserId = actor.UserId,
            LocationId = actor.LocationId,
            OpeningCash = openingCash,
            OpenedAt = clock.GetUtcNow(),
            Revision = Guid.NewGuid()
        };
        context.CashShifts.Add(shift);
        try
        {
            await context.SaveChangesAsync(cancellationToken);
            return Summary(shift);
        }
        catch (DbUpdateException error) when (error.InnerException is SqlException { Number: 2601 or 2627 })
        {
            return null;
        }
    }

    public async Task<ShiftSummary?> CloseAsync(
        ShiftOperator actor, ShiftClosure closure, CancellationToken cancellationToken)
    {
        if (decimal.Round(closure.ActualCash, 2) != closure.ActualCash) return null;
        var shift = await context.CashShifts.SingleOrDefaultAsync(item => item.Id == closure.Id &&
            item.UserId == actor.UserId && item.LocationId == actor.LocationId, cancellationToken);
        if (shift is null) return null;
        if (shift.ClosedAt.HasValue)
            return shift.ActualCash == closure.ActualCash && shift.CloseNote == closure.Note?.Trim()
                ? Summary(shift) : null;

        var cashSales = await context.Sales.Where(sale => sale.ShiftId == shift.Id &&
            sale.PaymentMethod == "Cash" && !sale.IsDeleted)
            .SumAsync(sale => sale.TotalAmount, cancellationToken);
        var movements = await context.ShiftMovements.Where(item => item.ShiftId == shift.Id && item.Kind != "CardRefund")
            .SumAsync(item => item.Amount, cancellationToken);
        var expected = shift.OpeningCash + cashSales + movements;
        if (expected != closure.ActualCash && string.IsNullOrWhiteSpace(closure.Note)) return null;

        shift.ExpectedCash = expected;
        shift.ActualCash = closure.ActualCash;
        shift.CloseNote = closure.Note?.Trim();
        shift.ClosedAt = clock.GetUtcNow();
        shift.Revision = Guid.NewGuid();
        try
        {
            await context.SaveChangesAsync(cancellationToken);
            return Summary(shift);
        }
        catch (DbUpdateConcurrencyException)
        {
            return null;
        }
    }

    private static ShiftSummary Summary(CashShift shift) =>
        new(shift.Id, shift.OpeningCash, shift.OpenedAt, shift.ClosedAt, shift.ExpectedCash, shift.ActualCash);
}

public sealed record ShiftOperator(int UserId, int LocationId);
public sealed record ShiftClosure(int Id, decimal ActualCash, string? Note);
public sealed record ShiftSummary(int Id, decimal OpeningCash, DateTimeOffset OpenedAt,
    DateTimeOffset? ClosedAt, decimal? ExpectedCash, decimal? ActualCash);
