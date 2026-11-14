// Records server-priced sales and their actual stock allocations atomically.
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.DTOs.Sales;
using PharmacyAPI.Models;
using Microsoft.Data.SqlClient;
using System.Security.Cryptography;
using System.Text.Json;

namespace PharmacyAPI.Services;

public sealed class SalesService(AppDbContext context, InventoryService inventory, IConfiguration configuration)
{
    public Task<int?> GetCompletedOperationAsync(int userId, int locationId, Guid operationId, CancellationToken token) =>
        context.Sales.Where(sale => !sale.IsDeleted && sale.UserId == userId &&
            sale.LocationId == locationId && sale.OperationId == operationId)
            .Select(sale => (int?)sale.Id).SingleOrDefaultAsync(token);

    public async Task<Sale?> CreateSaleAsync(
        SaleRequest request, CancellationToken cancellationToken)
    {
        var fingerprint = request.OperationId.HasValue ? Fingerprint(request) : null;
        var previous = await FindPreviousAsync(request, cancellationToken);
        if (previous is not null) return previous.RequestFingerprint == fingerprint ? previous : null;

        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);
        var sale = new Sale
        {
            LocationId = request.LocationId,
            UserId = request.UserId,
            OperationId = request.OperationId,
            RequestFingerprint = fingerprint,
            ShiftId = request.Body.ShiftId,
            PaymentMethod = request.Body.PaymentMethod
        };
        if (sale.ShiftId is int shiftId)
        {
            var shift = await context.CashShifts.SingleOrDefaultAsync(item =>
                item.Id == shiftId && item.UserId == request.UserId &&
                item.LocationId == request.LocationId && item.ClosedAt == null, cancellationToken);
            if (shift is null) return null;
            shift.Revision = Guid.NewGuid();
        }

        var lineNumber = 0;
        foreach (var line in request.Body.Items.OrderBy(item => item.ProductId))
        {
            var product = await context.Products.AsNoTracking()
                .Where(product => product.Id == line.ProductId && !product.IsDeleted)
                .SingleOrDefaultAsync(cancellationToken);
            if (product is null) return null;
            var size = line.IsPack ? product.PackSize : 1;
            var price = line.IsPack ? product.PackPrice : product.SellPrice;
            if (size is null or < 1 || price is null or < 0) return null;
            var soldUnit = line.IsPack ? product.PackName : product.Unit;

            var allocations = await inventory.AllocateAsync(
                new StockAllocation(line.ProductId, request.LocationId, line.Quantity * size.Value, request.UserId),
                cancellationToken);
            if (allocations is null) return null;

            var allocated = 0;
            var subtotal = 0m;
            lineNumber++;
            foreach (var allocation in allocations)
            {
                allocated += allocation.Quantity;
                var cumulative = decimal.Round(allocated * price.Value / size.Value, 2, MidpointRounding.AwayFromZero);
                sale.SaleItems.Add(new SaleItem
                {
                    ProductId = line.ProductId,
                    BatchId = allocation.BatchId,
                    Quantity = allocation.Quantity,
                    UnitPrice = price.Value,
                    SoldUnit = soldUnit,
                    UnitsPerPack = size,
                    Amount = cumulative - subtotal,
                    LineNumber = lineNumber
                });
                subtotal = cumulative;
            }
        }

        sale.TotalAmount = sale.SaleItems.Sum(item => item.Amount!.Value);
        if (!await ApplyDiscountAsync(sale, request, cancellationToken)) return null;
        context.Sales.Add(sale);

        try
        {
            await context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return sale;
        }
        catch (DbUpdateException error) when (error is DbUpdateConcurrencyException ||
            error.InnerException is SqlException { Number: 2601 or 2627 })
        {
            await transaction.RollbackAsync(cancellationToken);
        }

        await transaction.DisposeAsync();
        previous = await FindPreviousAsync(request, cancellationToken);
        return previous?.RequestFingerprint == fingerprint ? previous : null;
    }

    private async Task<bool> ApplyDiscountAsync(Sale sale, SaleRequest request, CancellationToken token)
    {
        var input = request.Body;
        var amount = input.DiscountAmount;
        if (amount == 0) return input.DiscountApprovalId is null;
        if (!sale.ShiftId.HasValue || string.IsNullOrWhiteSpace(input.DiscountReason) ||
            amount > sale.TotalAmount || decimal.Round(amount, 2) != amount) return false;

        var limit = Math.Clamp(configuration.GetValue("Sales:UnapprovedDiscountPercent", 5m), 0m, 100m);
        if (amount > sale.TotalAmount * limit / 100 || input.DiscountApprovalId.HasValue)
        {
            var approval = await context.Set<DiscountApproval>().SingleOrDefaultAsync(item =>
                item.Id == input.DiscountApprovalId && item.Approved == true && !item.Used &&
                item.LocationId == sale.LocationId && item.UserId == sale.UserId && item.ShiftId == sale.ShiftId, token);
            if (approval is null || approval.Amount != amount || approval.Reason != input.DiscountReason.Trim() ||
                approval.Cart != CartFingerprint(input.Items)) return false;
            approval.Used = true;
            sale.DiscountApprovalId = approval.Id;
        }

        var allocated = 0m;
        var priorDiscount = 0m;
        foreach (var part in sale.SaleItems)
        {
            allocated += part.Amount!.Value;
            var discount = decimal.Round(amount * allocated / sale.TotalAmount, 2, MidpointRounding.AwayFromZero);
            part.Amount -= discount - priorDiscount;
            priorDiscount = discount;
        }
        sale.TotalAmount -= amount;
        sale.DiscountAmount = amount;
        sale.DiscountReason = input.DiscountReason.Trim();
        return true;
    }

    internal static string CartFingerprint(IEnumerable<SaleItemDto> items) =>
        Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(items
            .OrderBy(item => item.ProductId).ThenBy(item => item.IsPack).ThenBy(item => item.Quantity)
            .Select(item => new { item.ProductId, item.Quantity, item.IsPack }))));

    private Task<Sale?> FindPreviousAsync(SaleRequest request, CancellationToken cancellationToken) =>
        request.OperationId is Guid id
            ? context.Sales.AsNoTracking().SingleOrDefaultAsync(sale => sale.UserId == request.UserId &&
                sale.LocationId == request.LocationId && sale.OperationId == id, cancellationToken)
            : Task.FromResult<Sale?>(null);

    private static string Fingerprint(SaleRequest request)
    {
        if (request.Body.DiscountAmount != 0 || request.Body.DiscountApprovalId.HasValue)
        {
            var discount = new
            {
                request.Body.ShiftId, request.Body.PaymentMethod, request.Body.DiscountAmount,
                request.Body.DiscountReason, request.Body.DiscountApprovalId, Cart = CartFingerprint(request.Body.Items)
            };
            return Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(discount)));
        }
        if (request.Body.Items.Any(item => item.IsPack))
        {
            var units = new
            {
                request.Body.ShiftId, request.Body.PaymentMethod,
                Items = request.Body.Items.OrderBy(item => item.ProductId).ThenBy(item => item.IsPack)
                    .ThenBy(item => item.Quantity).Select(item => new { item.ProductId, item.Quantity, item.IsPack })
            };
            return Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(units)));
        }
        var payload = new
        {
            request.Body.ShiftId,
            request.Body.PaymentMethod,
            Items = request.Body.Items.OrderBy(item => item.ProductId).ThenBy(item => item.Quantity)
                .Select(item => new { item.ProductId, item.Quantity })
        };
        return Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(payload)));
    }
}

public sealed record SaleRequest(int LocationId, int UserId, CreateSaleDto Body, Guid? OperationId);
