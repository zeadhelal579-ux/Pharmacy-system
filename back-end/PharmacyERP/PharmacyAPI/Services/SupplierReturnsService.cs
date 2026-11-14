// Deducts returned stock from the original receipt's batch under its concurrency token.
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.DTOs;
using PharmacyAPI.Models;

namespace PharmacyAPI.Services;

public sealed class SupplierReturnsService(AppDbContext context, TimeProvider clock)
{
    public async Task<List<ReturnableReceipt>> ListAsync(PurchaseAccess access, CancellationToken cancellationToken)
    {
        var lines = context.PurchaseOrders.Where(order => order.Id == access.OrderId &&
                (access.LocationId == null || order.LocationId == access.LocationId))
            .SelectMany(order => order.Lines).Select(line => line.Id);
        return await context.PurchaseReceipts.AsNoTracking()
            .Where(receipt => lines.Contains(receipt.PurchaseLineId)).OrderByDescending(receipt => receipt.Id)
            .Select(receipt => new ReturnableReceipt(receipt.Id, receipt.PurchaseLine.Product.Name,
                receipt.Batch.BatchNumber, receipt.InvoiceNumber, receipt.Quantity, receipt.UnitCost,
                receipt.Batch.IsDeleted ? 0 : receipt.Batch.Quantity - receipt.Batch.ReservedQuantity, context.SupplierReturns
                    .Where(item => item.PurchaseReceiptId == receipt.Id).Sum(item => item.Quantity)))
            .ToListAsync(cancellationToken);
    }

    public async Task<SupplierReturnSummary?> RecordAsync(
        ReceiptAccess access, SupplierReturnInput input, CancellationToken cancellationToken)
    {
        var receipt = await context.PurchaseReceipts.Include(item => item.Batch)
            .SingleOrDefaultAsync(item => item.Id == access.ReceiptId &&
                (access.LocationId == null || item.Batch.LocationId == access.LocationId), cancellationToken);
        if (receipt is null) return null;
        var previous = await FindAsync(receipt.Id, input.OperationId, cancellationToken);
        if (previous is not null) return Replay(previous, input, receipt.UnitCost);
        if (receipt.Batch.IsDeleted || receipt.Batch.Quantity - receipt.Batch.ReservedQuantity < input.Quantity) return null;
        var returned = await context.SupplierReturns.Where(item => item.PurchaseReceiptId == receipt.Id)
            .SumAsync(item => item.Quantity, cancellationToken);
        if (input.Quantity > receipt.Quantity - returned) return null;

        var now = clock.GetUtcNow();
        var result = new SupplierReturn
        {
            PurchaseReceiptId = receipt.Id, OperationId = input.OperationId, Quantity = input.Quantity,
            Reason = input.Reason, UserId = access.UserId, CreatedAt = now
        };
        receipt.Batch.Quantity -= input.Quantity;
        receipt.Batch.UpdatedAt = now.UtcDateTime;
        context.SupplierReturns.Add(result);
        context.InventoryTransactions.Add(new InventoryTransaction
        {
            ProductId = receipt.Batch.ProductId, BatchId = receipt.BatchId,
            FromLocationId = receipt.Batch.LocationId, ReferenceId = receipt.Id,
            Type = "SupplierReturn", Quantity = input.Quantity, UserId = access.UserId, CreatedAt = now.UtcDateTime
        });
        try
        {
            await context.SaveChangesAsync(cancellationToken);
            return Summary(result, receipt.UnitCost);
        }
        catch (DbUpdateException error) when (error is DbUpdateConcurrencyException ||
            error.InnerException is SqlException { Number: 2601 or 2627 })
        {
            previous = await FindAsync(receipt.Id, input.OperationId, cancellationToken);
            return previous is null ? null : Replay(previous, input, receipt.UnitCost);
        }
    }

    private Task<SupplierReturn?> FindAsync(int id, Guid key, CancellationToken cancellationToken) =>
        context.SupplierReturns.AsNoTracking().SingleOrDefaultAsync(item =>
            item.PurchaseReceiptId == id && item.OperationId == key, cancellationToken);

    private static SupplierReturnSummary? Replay(SupplierReturn item, SupplierReturnInput input, decimal cost) =>
        item.Quantity == input.Quantity && item.Reason == input.Reason ? Summary(item, cost) : null;

    private static SupplierReturnSummary Summary(SupplierReturn item, decimal cost) =>
        new(item.Id, item.Quantity, item.Quantity * cost);
}

public sealed record ReceiptAccess(int ReceiptId, int? LocationId, int UserId);
public sealed record SupplierReturnSummary(int Id, int Quantity, decimal ExpectedCredit);
public sealed record ReturnableReceipt(int Id, string ProductName, string? BatchNumber, string InvoiceNumber,
    int Quantity, decimal UnitCost, int Stock, int Returned)
{
    public int Returnable => Math.Max(0, Math.Min(Quantity - Returned, Stock));
}
