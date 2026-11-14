// Applies idempotent cash adjustments and protects refund quantity across shifts.
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Services;

public sealed class ShiftMovementService(AppDbContext context, TimeProvider clock)
{
    public async Task<MovementSummary?> RecordAsync(
        ShiftOperator actor, MovementRequest request, CancellationToken cancellationToken)
    {
        var shift = await context.CashShifts.SingleOrDefaultAsync(item => item.Id == request.ShiftId &&
            item.UserId == actor.UserId && item.LocationId == actor.LocationId, cancellationToken);
        if (shift is null) return null;

        var previous = await context.ShiftMovements.AsNoTracking().SingleOrDefaultAsync(item =>
            item.ShiftId == shift.Id && item.OperationId == request.OperationId, cancellationToken);
        if (previous is not null)
            return Matches(previous, request) ? Summary(previous) : null;
        if (shift.ClosedAt.HasValue) return null;

        var movement = new ShiftMovement
        {
            ShiftId = shift.Id, OperationId = request.OperationId, Kind = request.Kind,
            Reason = request.Reason, CreatedAt = clock.GetUtcNow(),
            Amount = request.Kind == "Withdrawal" ? -request.Amount : request.Amount
        };
        if (request.SaleId.HasValue && !await ApplyRefundAsync(actor, request, movement, cancellationToken))
            return null;

        shift.Revision = Guid.NewGuid();
        context.ShiftMovements.Add(movement);
        try
        {
            await context.SaveChangesAsync(cancellationToken);
            return Summary(movement);
        }
        catch (DbUpdateException error) when (error is DbUpdateConcurrencyException ||
            error.InnerException is SqlException { Number: 2601 or 2627 })
        {
            previous = await context.ShiftMovements.AsNoTracking().SingleOrDefaultAsync(item =>
                item.ShiftId == shift.Id && item.OperationId == request.OperationId, cancellationToken);
            return previous is not null && Matches(previous, request) ? Summary(previous) : null;
        }
    }

    private async Task<bool> ApplyRefundAsync(
        ShiftOperator actor, MovementRequest request, ShiftMovement movement, CancellationToken cancellationToken)
    {
        var line = await context.SaleItems.Include(item => item.Sale).Include(item => item.Batch)
            .SingleOrDefaultAsync(item => item.Id == request.SaleItemId && item.SaleId == request.SaleId &&
                !item.IsDeleted && !item.Sale.IsDeleted && item.Sale.LocationId == actor.LocationId,
                cancellationToken);
        if (line is null || line.Sale.PaymentMethod is not ("Cash" or "Card") || request.Quantity is not int quantity)
            return false;

        var returned = context.Entry(line).Property<int>("ReturnedQuantity");
        if (quantity > line.Quantity - returned.CurrentValue) return false;
        var lineAmount = line.Amount ?? line.Quantity * line.UnitPrice;
        var alreadyRefunded = decimal.Round(lineAmount * returned.CurrentValue / line.Quantity, 2, MidpointRounding.AwayFromZero);
        returned.CurrentValue += quantity;
        var totalRefund = decimal.Round(lineAmount * returned.CurrentValue / line.Quantity, 2, MidpointRounding.AwayFromZero);
        movement.SaleItemId = line.Id;
        movement.Quantity = quantity;
        movement.Kind = line.Sale.PaymentMethod == "Cash" ? "CashRefund" : "CardRefund";
        movement.Amount = alreadyRefunded - totalRefund;
        context.Batches.Add(new Batch
        {
            ProductId = line.ProductId,
            LocationId = actor.LocationId,
            BatchNumber = line.Batch.BatchNumber,
            ExpiryDate = line.Batch.ExpiryDate,
            Cost = line.Batch.Cost,
            Quantity = quantity,
            IsQuarantined = true,
            CreatedAt = clock.GetUtcNow().UtcDateTime,
            UpdatedAt = clock.GetUtcNow().UtcDateTime
        });
        return true;
    }

    private static bool Matches(ShiftMovement movement, MovementRequest request) =>
        (movement.Kind == request.Kind || request.Kind == "SaleRefund" && movement.Kind is "CashRefund" or "CardRefund") &&
        movement.Reason == request.Reason &&
        movement.SaleItemId == request.SaleItemId && movement.Quantity == request.Quantity &&
        (request.SaleId.HasValue || Math.Abs(movement.Amount) == request.Amount);

    private static MovementSummary Summary(ShiftMovement item) =>
        new(item.Id, item.ShiftId, item.Kind, item.Amount, item.Quantity);
}

public sealed record MovementRequest(int ShiftId, Guid OperationId, string Kind, string Reason,
    decimal Amount = 0, int? SaleId = null, int? SaleItemId = null, int? Quantity = null);

public sealed record MovementSummary(int Id, int ShiftId, string Kind, decimal Amount, int? Quantity);
