// Allocates eligible stock in expiry order within the caller's unit of work.
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Services;

public sealed class InventoryService(AppDbContext context, TimeProvider clock)
{
    public async Task<IReadOnlyList<InventoryTransaction>?> AllocateAsync(
        StockAllocation request, CancellationToken cancellationToken)
    {
        var allocations = await PlanAsync(request, cancellationToken);
        if (allocations is null) return null;
        var moves = allocations.Select(part => Dispatch(request, part.Batch, part.Quantity)).ToList();
        context.InventoryTransactions.AddRange(moves);
        return moves;
    }

    public async Task<List<StockPart>?> PlanAsync(StockAllocation request, CancellationToken cancellationToken)
    {
        var today = clock.GetLocalNow().Date;
        var batches = await context.BatchesOutsideRecall
            .Where(batch => batch.ProductId == request.ProductId &&
                batch.LocationId == request.SourceId && !batch.IsDeleted && !batch.IsQuarantined &&
                batch.Quantity > batch.ReservedQuantity && batch.ExpiryDate >= today)
            .OrderBy(batch => batch.ExpiryDate)
            .ThenBy(batch => batch.Id)
            .ToListAsync(cancellationToken);

        if (request.Quantity <= 0 ||
            batches.Sum(batch => (long)batch.Quantity - batch.ReservedQuantity) < request.Quantity) return null;

        var remaining = request.Quantity;
        var parts = new List<StockPart>();
        foreach (var batch in batches.Where(batch => batch.Quantity > batch.ReservedQuantity))
        {
            var quantity = Math.Min(batch.Quantity - batch.ReservedQuantity, remaining);
            parts.Add(new StockPart(batch, quantity));
            remaining -= quantity;
            if (remaining == 0) break;
        }

        return parts;
    }

    public InventoryTransaction Dispatch(StockAllocation request, Batch batch, int quantity)
    {
        batch.Quantity -= quantity;
        batch.UpdatedAt = clock.GetUtcNow().UtcDateTime;
        return new InventoryTransaction
        {
            ProductId = batch.ProductId, BatchId = batch.Id, FromLocationId = request.SourceId,
            ToLocationId = request.DestinationId, Quantity = quantity,
            Type = request.DestinationId.HasValue ? "TransferDispatch" : "Sale",
            ReferenceId = request.ReferenceId, UserId = request.UserId
        };
    }
}

public sealed record StockPart(Batch Batch, int Quantity);
public sealed record StockAllocation(
    int ProductId, int SourceId, int Quantity, int UserId, int? DestinationId = null, int? ReferenceId = null);
