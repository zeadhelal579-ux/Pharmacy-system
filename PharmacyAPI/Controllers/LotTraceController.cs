// Traces and quarantines stock sharing a product and lot number.
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Controllers;

[ApiController, Route("api/inventory/lots"), Authorize(Roles = "SuperAdmin,BranchManager,WarehouseAdmin")]
public sealed class LotTraceController(AppDbContext context, TimeProvider clock) : ControllerBase
{
    [HttpGet("trace")]
    public async Task<IActionResult> Trace(int productId, [Required, MaxLength(80)] string lot, CancellationToken token)
    {
        var scope = User.Scope();
        var batches = Lot(productId, lot.Trim());
        var visible = batches.Where(batch => scope == null || batch.LocationId == scope);
        var stock = await visible.Select(batch => new
        {
            batch.Id, batch.LocationId, Location = batch.Location.Name, batch.Quantity,
            batch.ExpiryDate, batch.IsQuarantined
        }).OrderBy(batch => batch.LocationId).ThenBy(batch => batch.Id).ToListAsync(token);
        var sales = await context.SaleItems.Where(item => !item.IsDeleted && !item.Sale.IsDeleted &&
            batches.Any(batch => batch.Id == item.BatchId) && (scope == null || item.Sale.LocationId == scope))
            .OrderByDescending(item => item.SaleId).Select(item => new
            {
                item.Id, item.SaleId, item.Sale.LocationId, item.Quantity, item.Sale.CreatedAt
            }).ToListAsync(token);
        var transfers = await context.InventoryTransactions.Where(item => !item.IsDeleted &&
            item.Type == "TransferDispatch" && batches.Any(batch => batch.Id == item.BatchId) &&
            (scope == null || item.FromLocationId == scope || item.ToLocationId == scope))
            .OrderByDescending(item => item.Id).Select(item => new
            {
                item.Id, TransferId = item.ReferenceId, item.FromLocationId, item.ToLocationId, Shipped = item.Quantity,
                Accounted = context.TransferReceipts.Where(receipt => receipt.MovementId == item.Id)
                    .Sum(receipt => receipt.Accepted + receipt.Damaged + receipt.Missing)
            }).ToListAsync(token);
        var recall = await context.ActiveLotRecalls.Where(item => item.ProductId == productId && item.Lot == lot.Trim())
            .Select(item => new { item.Id, item.Reason, item.OpenedAt }).SingleOrDefaultAsync(token);
        return Ok(new { stock, sales, transfers, recall });
    }

    [HttpPost("recalls"), Authorize(Roles = "SuperAdmin")]
    public async Task<IActionResult> OpenRecall(LotQuarantine input, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(input.Lot) || string.IsNullOrWhiteSpace(input.Reason)) return BadRequest();
        var lot = input.Lot.Trim();
        await using var transaction = await context.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, token);
        var existing = await context.ActiveLotRecalls.SingleOrDefaultAsync(item =>
            item.ProductId == input.ProductId && item.Lot == lot, token);
        if (existing is not null)
            return existing.Reason == input.Reason.Trim() ? Ok(new { existing.Id }) : Conflict();
        if (!await context.Products.AnyAsync(item => item.Id == input.ProductId, token)) return NotFound();
        var recall = new LotRecall
        {
            ProductId = input.ProductId, Lot = lot, Reason = input.Reason.Trim(),
            OpenedBy = CurrentUserId(), OpenedAt = clock.GetUtcNow()
        };
        context.LotRecalls.Add(recall);
        await HoldAsync(recall.ProductId, lot, recall.Reason, token);
        return await CommitRecallAsync(transaction, recall, token);
    }

    [HttpPost("recalls/{id:int}/close"), Authorize(Roles = "SuperAdmin")]
    public async Task<IActionResult> CloseRecall(int id, RecallClosure input, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(input.Reason)) return BadRequest();
        await using var transaction = await context.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, token);
        var recall = await context.LotRecalls.SingleOrDefaultAsync(item => item.Id == id, token);
        if (recall is null) return NotFound();
        if (recall.ClosedAt.HasValue)
            return recall.CloseReason == input.Reason.Trim() ? Ok(new { recall.Id }) : Conflict();
        recall.ClosedAt = clock.GetUtcNow();
        recall.ClosedBy = CurrentUserId();
        recall.CloseReason = input.Reason.Trim();
        await HoldAsync(recall.ProductId, recall.Lot, recall.Reason, token);
        return await CommitRecallAsync(transaction, recall, token);
    }

    private async Task<IActionResult> CommitRecallAsync(
        Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction, LotRecall recall, CancellationToken token)
    {
        try
        {
            await context.SaveChangesAsync(token);
            await transaction.CommitAsync(token);
            return Ok(new { recall.Id });
        }
        catch (DbUpdateException error) when (error is DbUpdateConcurrencyException ||
            error.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 or 1205 })
        {
            return Conflict(new { message = "Stock changed. Reload and try again." });
        }
    }

    [HttpPost("quarantine")]
    public async Task<IActionResult> Quarantine(LotQuarantine input, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(input.Lot) || string.IsNullOrWhiteSpace(input.Reason)) return BadRequest();
        var scope = User.Scope();
        await using var transaction = await context.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, token);
        var changed = await HoldAsync(input.ProductId, input.Lot.Trim(), input.Reason.Trim(), token, scope);
        try
        {
            await context.SaveChangesAsync(token);
            await transaction.CommitAsync(token);
            return Ok(new { changed });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Stock changed. Reload and try again." });
        }
    }

    private async Task<int> HoldAsync(int productId, string lot, string reason, CancellationToken token, int? scope = null)
    {
        var batches = await Lot(productId, lot).Where(batch => !batch.IsDeleted &&
            !batch.IsQuarantined && (scope == null || batch.LocationId == scope)).ToListAsync(token);
        var now = clock.GetUtcNow();
        var userId = CurrentUserId();
        foreach (var batch in batches)
        {
            batch.IsQuarantined = true;
            batch.UpdatedAt = now.UtcDateTime;
            context.BatchStatusChanges.Add(new BatchStatusChange
            {
                BatchId = batch.Id, Quarantined = true, Reason = reason,
                UserId = userId, CreatedAt = now
            });
        }
        return batches.Count;
    }

    private int CurrentUserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private IQueryable<Batch> Lot(int productId, string lot) =>
        context.Batches.Where(batch => batch.ProductId == productId && batch.BatchNumber == lot);
}

public sealed record LotQuarantine([Range(1, int.MaxValue)] int ProductId,
    [Required, MaxLength(80)] string Lot, [Required, MaxLength(500)] string Reason);
public sealed record RecallClosure([Required, MaxLength(500)] string Reason);
