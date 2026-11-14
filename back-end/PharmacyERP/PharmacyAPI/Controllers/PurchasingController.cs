// Exposes supplier orders and receipt entry to authorized branch staff.
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.DTOs;
using PharmacyAPI.Models;
using PharmacyAPI.Services;
using System.Security.Claims;

namespace PharmacyAPI.Controllers;

[ApiController, Route("api")]
[Authorize(Roles = "SuperAdmin,BranchManager,WarehouseAdmin")]
public sealed class PurchasingController(
    AppDbContext context, PurchasingService purchasing, SupplierReturnsService returns) : ControllerBase
{
    [HttpGet("suppliers")]
    public async Task<IActionResult> Suppliers(CancellationToken cancellationToken) =>
        Ok(await context.Suppliers.AsNoTracking().Where(item => !item.IsDeleted)
            .OrderBy(item => item.Name).Select(item => new { item.Id, item.Name, item.Contact })
            .ToListAsync(cancellationToken));

    [HttpPost("suppliers")]
    public async Task<IActionResult> CreateSupplier(SupplierInput input, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) return BadRequest();
        var supplier = new Supplier { Name = input.Name.Trim(), Contact = input.Contact?.Trim() };
        context.Suppliers.Add(supplier);
        await context.SaveChangesAsync(cancellationToken);
        return StatusCode(201, new { supplier.Id, supplier.Name });
    }

    [HttpGet("purchase-orders")]
    public async Task<IActionResult> Orders(CancellationToken cancellationToken)
    {
        var orders = await purchasing.ListAsync(User.Scope(), cancellationToken);
        return Ok(orders.Select(order => new
        {
            order.Id, order.LocationId, order.SupplierId, SupplierName = order.Supplier.Name,
            order.CreatedAt, order.ApprovedAt, order.ApprovedBy,
            Lines = order.Lines.Select(line => new
            {
                line.Id, line.ProductId, ProductName = line.Product.Name, line.Quantity, line.Received, line.UnitCost
            })
        }));
    }

    [HttpPost("purchase-orders")]
    public async Task<IActionResult> CreateOrder(OrderInput input, CancellationToken cancellationToken)
    {
        if (!User.CanAccess(input.LocationId)) return Forbid();
        var id = await purchasing.CreateAsync(input, UserId(), cancellationToken);
        return id is null ? BadRequest(new { message = "Invalid purchase order" }) : StatusCode(201, new { id });
    }

    [Authorize(Roles = "SuperAdmin,BranchManager")]
    [HttpPost("purchase-orders/{id:int}/approve")]
    public async Task<IActionResult> Approve(int id, CancellationToken cancellationToken) =>
        await purchasing.ApproveAsync(new PurchaseAccess(id, User.Scope(), UserId()), cancellationToken)
            ? Ok(new { id }) : Conflict();

    [HttpPost("purchase-orders/{id:int}/receipts")]
    public async Task<IActionResult> Receive(int id, ReceiptInput input, CancellationToken cancellationToken)
    {
        if (input.OperationId == Guid.Empty || string.IsNullOrWhiteSpace(input.BatchNumber) ||
            string.IsNullOrWhiteSpace(input.InvoiceNumber)) return BadRequest();

        var result = await purchasing.ReceiveAsync(new PurchaseAccess(id, User.Scope(), UserId()),
            input with { BatchNumber = input.BatchNumber.Trim(), InvoiceNumber = input.InvoiceNumber.Trim() },
            cancellationToken);
        return result is null ? Conflict(new { message = "Receipt could not be recorded for this order line" }) : Ok(result);
    }

    [HttpGet("purchase-orders/{id:int}/receipts")]
    public async Task<IActionResult> Receipts(int id, CancellationToken cancellationToken) =>
        Ok(await returns.ListAsync(new PurchaseAccess(id, User.Scope(), UserId()), cancellationToken));

    [HttpPost("purchase-receipts/{id:int}/returns")]
    public async Task<IActionResult> ReturnStock(int id, SupplierReturnInput input, CancellationToken cancellationToken)
    {
        if (input.OperationId == Guid.Empty || string.IsNullOrWhiteSpace(input.Reason)) return BadRequest();
        var result = await returns.RecordAsync(new ReceiptAccess(id, User.Scope(), UserId()),
            input with { Reason = input.Reason.Trim() }, cancellationToken);
        return result is null ? Conflict(new { message = "Return exceeds available receipt stock or is unavailable" }) : Ok(result);
    }

    private int UserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
