// Creates supplier orders and atomically receives stock against outstanding quantities.
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.DTOs;
using PharmacyAPI.Models;

namespace PharmacyAPI.Services;

public sealed class PurchasingService(AppDbContext context, TimeProvider clock)
{
    public Task<List<PurchaseOrder>> ListAsync(int? location, CancellationToken cancellationToken) =>
        context.PurchaseOrders.AsNoTracking()
            .Where(order => location == null || order.LocationId == location)
            .Include(order => order.Supplier).Include(order => order.Lines).ThenInclude(line => line.Product)
            .OrderByDescending(order => order.Id).Take(100).ToListAsync(cancellationToken);

    public async Task<int?> CreateAsync(OrderInput request, int userId, CancellationToken cancellationToken)
    {
        if (request.Lines.Any(line => line is null || decimal.Round(line.UnitCost, 2) != line.UnitCost))
            return null;
        var products = request.Lines.Select(line => line.ProductId).Distinct().ToArray();
        if (products.Length != request.Lines.Length ||
            await context.Products.CountAsync(product => !product.IsDeleted && products.Contains(product.Id),
                cancellationToken) != products.Length ||
            !await context.Suppliers.AnyAsync(item => item.Id == request.SupplierId && !item.IsDeleted, cancellationToken) ||
            !await context.Locations.AnyAsync(item => item.Id == request.LocationId && !item.IsDeleted, cancellationToken))
            return null;

        var order = new PurchaseOrder
        {
            SupplierId = request.SupplierId, LocationId = request.LocationId, UserId = userId,
            CreatedAt = clock.GetUtcNow(),
            Lines = request.Lines.Select(line => new PurchaseLine
            {
                ProductId = line.ProductId, Quantity = line.Quantity, UnitCost = line.UnitCost
            }).ToList()
        };
        context.PurchaseOrders.Add(order);
        await context.SaveChangesAsync(cancellationToken);
        return order.Id;
    }

    public async Task<bool> ApproveAsync(PurchaseAccess access, CancellationToken cancellationToken)
    {
        var order = await context.PurchaseOrders.SingleOrDefaultAsync(item => item.Id == access.OrderId &&
            (access.LocationId == null || item.LocationId == access.LocationId), cancellationToken);
        if (order is null) return false;
        if (order.ApprovedAt.HasValue) return true;
        order.ApprovedAt = clock.GetUtcNow();
        order.ApprovedBy = access.UserId;
        try
        {
            await context.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateConcurrencyException)
        {
            return false;
        }
    }

    public async Task<ReceiptSummary?> ReceiveAsync(
        PurchaseAccess access, ReceiptInput request, CancellationToken cancellationToken)
    {
        var order = await context.PurchaseOrders.Include(item => item.Lines)
            .SingleOrDefaultAsync(item => item.Id == access.OrderId &&
                (access.LocationId == null || item.LocationId == access.LocationId), cancellationToken);
        var line = order?.Lines.SingleOrDefault(item => item.Id == request.LineId);
        if (order is null || line is null) return null;
        var existing = await FindReceiptAsync(request.OperationId, cancellationToken);
        if (existing is not null) return Replay(existing, request, line);
        if (!order.ApprovedAt.HasValue) return null;
        if (request.Quantity > line.Quantity - line.Received ||
            request.ExpiryDate < DateOnly.FromDateTime(clock.GetLocalNow().Date) ||
            decimal.Round(request.UnitCost, 2) != request.UnitCost) return null;

        var receipt = new PurchaseReceipt
        {
            PurchaseLineId = line.Id, OperationId = request.OperationId, UserId = access.UserId,
            Quantity = request.Quantity, UnitCost = request.UnitCost, InvoiceNumber = request.InvoiceNumber,
            CreatedAt = clock.GetUtcNow(),
            Batch = new Batch
            {
                ProductId = line.ProductId, LocationId = order.LocationId, Quantity = request.Quantity,
                BatchNumber = request.BatchNumber, ExpiryDate = request.ExpiryDate.ToDateTime(TimeOnly.MinValue),
                Cost = request.UnitCost
            }
        };
        line.Received += request.Quantity;
        context.PurchaseReceipts.Add(receipt);
        try
        {
            await context.SaveChangesAsync(cancellationToken);
            return Summary(receipt, line);
        }
        catch (DbUpdateException error) when (error is DbUpdateConcurrencyException ||
            error.InnerException is SqlException { Number: 2601 or 2627 })
        {
            context.ChangeTracker.Clear();
            existing = await FindReceiptAsync(request.OperationId, cancellationToken);
            if (existing is null) return null;
            var persistedLine = existing.PurchaseLine;
            return persistedLine.Id == line.Id ? Replay(existing, request, persistedLine) : null;
        }
    }

    private Task<PurchaseReceipt?> FindReceiptAsync(Guid key, CancellationToken cancellationToken) =>
        context.PurchaseReceipts.AsNoTracking().Include(item => item.Batch).Include(item => item.PurchaseLine)
            .SingleOrDefaultAsync(item => item.OperationId == key, cancellationToken);

    private static ReceiptSummary? Replay(PurchaseReceipt receipt, ReceiptInput request, PurchaseLine line) =>
        receipt.PurchaseLineId == line.Id && receipt.Quantity == request.Quantity &&
        receipt.UnitCost == request.UnitCost && receipt.InvoiceNumber == request.InvoiceNumber &&
        receipt.Batch.BatchNumber == request.BatchNumber &&
        DateOnly.FromDateTime(receipt.Batch.ExpiryDate) == request.ExpiryDate ? Summary(receipt, line) : null;

    private static ReceiptSummary Summary(PurchaseReceipt receipt, PurchaseLine line) =>
        new(receipt.Id, receipt.BatchId, line.Quantity - line.Received, receipt.UnitCost - line.UnitCost);
}

public sealed record PurchaseAccess(int OrderId, int? LocationId, int UserId);
public sealed record ReceiptSummary(int Id, int BatchId, int Remaining, decimal UnitCostDifference);
