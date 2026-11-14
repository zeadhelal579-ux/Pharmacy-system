// Computes location replenishment from eligible stock and outstanding shipments.
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Controllers;

[ApiController, Route("api/reports/replenishment")]
[Authorize(Roles = "SuperAdmin,BranchManager,WarehouseAdmin")]
public sealed class ReplenishmentController(AppDbContext context, TimeProvider clock) : ControllerBase
{
    [HttpGet("{locationId:int}")]
    public async Task<IActionResult> List(int locationId, CancellationToken token)
    {
        if (!User.CanAccess(locationId)) return Forbid();
        var today = clock.GetLocalNow().Date;
        var balances = await context.BatchesOutsideRecall.Where(batch => !batch.IsDeleted &&
            !batch.Location.IsDeleted && !batch.IsQuarantined && batch.ExpiryDate >= today && batch.Quantity > 0)
            .GroupBy(batch => new { batch.ProductId, batch.LocationId })
            .Select(group => new { group.Key.ProductId, group.Key.LocationId, Balance = group.Sum(item => (long)item.Quantity - item.ReservedQuantity) })
            .ToListAsync(token);
        var incoming = await context.InventoryTransactions.Where(item => !item.IsDeleted &&
            item.Type == "TransferDispatch" && item.ToLocationId == locationId && !item.Batch.IsQuarantined &&
            item.Batch.ExpiryDate >= today && context.BatchesOutsideRecall.Any(batch => batch.Id == item.BatchId))
            .Select(item => new { item.ProductId, Outstanding = item.Quantity -
                context.TransferReceipts.Where(receipt => receipt.MovementId == item.Id)
                    .Sum(receipt => receipt.Accepted + receipt.Damaged + receipt.Missing) }).ToListAsync(token);
        var commitments = await context.TransferRequests.Where(item => !item.IsDeleted && item.Status == "ReadyToShip" &&
                !context.TransferReservations.Any(reservation => reservation.TransferRequestId == item.Id))
            .GroupBy(item => new { item.ProductId, item.FromLocationId })
            .Select(group => new { group.Key.ProductId, group.Key.FromLocationId, Quantity = group.Sum(item => (long)item.Quantity) })
            .ToDictionaryAsync(item => (item.ProductId, item.FromLocationId), item => item.Quantity, token);
        var rules = await context.ReorderRules.ToDictionaryAsync(item => (item.ProductId, item.LocationId), item => item.Minimum, token);
        var reservations = await context.Batches.Where(batch => !batch.IsDeleted && batch.LocationId == locationId &&
                batch.ReservedQuantity > 0)
            .GroupBy(batch => batch.ProductId).Select(group => new { ProductId = group.Key, Reserved = group.Sum(batch => (long)batch.ReservedQuantity) })
            .ToDictionaryAsync(item => item.ProductId, item => item.Reserved, token);
        var products = await context.Products.AsNoTracking().Where(item => !item.IsDeleted)
            .OrderBy(item => item.Name).Select(item => new { item.Id, item.Name, item.MinStock }).ToListAsync(token);
        var byProduct = balances.ToLookup(item => item.ProductId);
        var transit = incoming.ToLookup(item => item.ProductId);
        return Ok(products.Select(product =>
        {
            var minimum = rules.GetValueOrDefault((product.Id, locationId), product.MinStock);
            var available = byProduct[product.Id].FirstOrDefault(item => item.LocationId == locationId)?.Balance ?? 0;
            var inTransit = transit[product.Id].Sum(item => (long)item.Outstanding);
            var approvedOutgoing = commitments.GetValueOrDefault((product.Id, locationId));
            var suggestedQuantity = Math.Max(0, minimum + 1L - available - inTransit + approvedOutgoing);
            var source = suggestedQuantity == 0 ? null : byProduct[product.Id].Where(item =>
                item.LocationId != locationId && item.Balance -
                commitments.GetValueOrDefault((product.Id, item.LocationId)) -
                rules.GetValueOrDefault((product.Id, item.LocationId), product.MinStock) - 1 >= suggestedQuantity)
                .OrderByDescending(item => item.Balance).ThenBy(item => item.LocationId).FirstOrDefault();
            return new
            {
                productId = product.Id, product.Name, minimum, available, inTransit, approvedOutgoing,
                reserved = reservations.GetValueOrDefault(product.Id),
                suggestedQuantity, suggestedSourceId = source?.LocationId,
                suggestion = suggestedQuantity == 0 ? "None" : source is null ? "Purchase" : "Transfer"
            };
        }));
    }

    [HttpPut("{locationId:int}/{productId:int}")]
    [Authorize(Roles = "SuperAdmin,BranchManager")]
    public async Task<IActionResult> Set(int locationId, int productId, ReorderMinimum input, CancellationToken token)
    {
        if (!User.CanAccess(locationId)) return Forbid();
        if (!await context.Products.AnyAsync(item => item.Id == productId && !item.IsDeleted, token) ||
            !await context.Locations.AnyAsync(item => item.Id == locationId && !item.IsDeleted, token)) return NotFound();
        var rule = await context.ReorderRules.FindAsync([productId, locationId], token);
        if (rule is null)
        {
            rule = new ReorderRule { ProductId = productId, LocationId = locationId };
            context.ReorderRules.Add(rule);
        }
        rule.Minimum = input.Minimum;
        try { await context.SaveChangesAsync(token); }
        catch (DbUpdateException error) when (error.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 })
        {
            return Conflict(new { message = "The reorder rule changed. Retry saving." });
        }
        return NoContent();
    }
}

public sealed record ReorderMinimum([Range(0, 1000000)] int Minimum);
