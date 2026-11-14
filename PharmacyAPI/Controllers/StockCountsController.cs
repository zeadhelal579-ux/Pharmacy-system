// Records per-batch counts and applies approved differences without replacing live balances.
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

namespace PharmacyAPI.Controllers;

[ApiController, Route("api/stock-counts")]
[Authorize(Roles = "SuperAdmin,BranchManager,WarehouseAdmin")]
public sealed class StockCountsController(AppDbContext context, TimeProvider clock) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        var scope = User.Scope();
        return Ok(await context.StockCounts.AsNoTracking()
            .Where(item => scope == null || item.Batch.LocationId == scope)
            .OrderByDescending(item => item.Id).Take(100)
            .Select(item => new
            {
                item.Id, item.BatchId, item.Batch.BatchNumber, ProductName = item.Batch.Product.Name,
                item.Baseline, item.Counted, item.Reason, item.CountedAt, item.ApprovedAt
            }).ToListAsync(cancellationToken));
    }

    [HttpPost]
    public async Task<IActionResult> Count(CountInput input, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(input.Reason)) return BadRequest();
        var scope = User.Scope();
        await using var transaction = await context.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.RepeatableRead, cancellationToken);
        var batch = await context.Batches.SingleOrDefaultAsync(item => item.Id == input.BatchId &&
            !item.IsDeleted && (scope == null || item.LocationId == scope), cancellationToken);
        if (batch is null) return NotFound();
        if (batch.Quantity != input.ExpectedQuantity)
            return Conflict(new { message = "Stock changed while counting. Reload the batch and recount." });

        var count = new StockCount
        {
            BatchId = batch.Id, Baseline = batch.Quantity, Counted = input.Counted,
            Reason = input.Reason.Trim(), CountedBy = UserId(), CountedAt = clock.GetUtcNow()
        };
        context.StockCounts.Add(count);
        try
        {
            await context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return StatusCode(201, new { count.Id });
        }
        catch (DbUpdateException error) when (error.InnerException is SqlException { Number: 2601 or 2627 or 1205 })
        {
            return Conflict(new { message = "A count is already pending or stock changed. Reload and try again." });
        }
    }

    [HttpPost("{id:int}/approve")]
    [Authorize(Roles = "SuperAdmin,BranchManager")]
    public async Task<IActionResult> Approve(int id, CancellationToken cancellationToken)
    {
        var scope = User.Scope();
        var count = await context.StockCounts.Include(item => item.Batch).SingleOrDefaultAsync(item =>
            item.Id == id && (scope == null || item.Batch.LocationId == scope), cancellationToken);
        if (count is null) return NotFound();
        if (count.ApprovedAt.HasValue) return Ok(new { count.Id });
        if (count.Batch.IsDeleted) return Conflict();

        var difference = count.Counted - count.Baseline;
        var adjusted = (long)count.Batch.Quantity + difference;
        if (adjusted < count.Batch.ReservedQuantity || adjusted > int.MaxValue)
            return Conflict(new { message = "The difference no longer fits the live stock balance" });

        var now = clock.GetUtcNow();
        count.ApprovedAt = now;
        count.ApprovedBy = UserId();
        count.Batch.Quantity = (int)adjusted;
        count.Batch.UpdatedAt = now.UtcDateTime;
        if (difference != 0)
        {
            context.InventoryTransactions.Add(new InventoryTransaction
            {
                ProductId = count.Batch.ProductId, BatchId = count.BatchId, ReferenceId = count.Id,
                Type = "StockCount", UserId = UserId(), Quantity = Math.Abs(difference),
                FromLocationId = difference < 0 ? count.Batch.LocationId : null,
                ToLocationId = difference > 0 ? count.Batch.LocationId : null
            });
        }

        try
        {
            await context.SaveChangesAsync(cancellationToken);
            return Ok(new { count.Id, count.Batch.Quantity });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Stock or count changed. Reload and try again." });
        }
    }

    private int UserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}

public sealed record CountInput([Range(1, int.MaxValue)] int BatchId,
    [Range(0, int.MaxValue)] int ExpectedQuantity, [Range(0, int.MaxValue)] int Counted,
    [Required, MaxLength(500)] string Reason);
