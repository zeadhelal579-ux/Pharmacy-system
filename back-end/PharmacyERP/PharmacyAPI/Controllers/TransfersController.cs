// Restricts shipment actions to the appropriate source or destination.
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyAPI.DTOs.Transfers;
using PharmacyAPI.Services;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

namespace PharmacyAPI.Controllers;

[ApiController, Route("api/transfers"), Authorize]
public sealed class TransfersController(TransferService transfers) : ControllerBase
{
    private const string Managers = "SuperAdmin,BranchManager,WarehouseAdmin";

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await transfers.GetAllTransfersAsync(User.Scope()));

    [HttpPost("request")]
    public async Task<IActionResult> RequestTransfer(CreateTransferDto input)
    {
        if (!User.CanAccess(input.FromLocationId) && !User.CanAccess(input.ToLocationId)) return Forbid();
        return Result(await transfers.RequestTransferAsync(input, Actor().UserId));
    }

    [Authorize(Roles = Managers), HttpPost("approve/{id:int}")]
    public async Task<IActionResult> Approve(int id, CancellationToken cancellationToken) =>
        Result(await transfers.DecideAsync(id, Actor(), true, cancellationToken));

    [Authorize(Roles = Managers), HttpPost("reject/{id:int}")]
    public async Task<IActionResult> Reject(int id, CancellationToken cancellationToken) =>
        Result(await transfers.DecideAsync(id, Actor(), false, cancellationToken));

    [Authorize(Roles = Managers), HttpPost("{id:int}/ship")]
    public async Task<IActionResult> Ship(int id, CancellationToken cancellationToken) =>
        Result(await transfers.ShipAsync(id, Actor(), cancellationToken));

    [HttpGet("{id:int}/shipment")]
    public async Task<IActionResult> Shipment(int id, CancellationToken cancellationToken)
    {
        var lines = await transfers.ShipmentAsync(id, Actor(), cancellationToken);
        return lines is null ? NotFound() : Ok(lines);
    }

    [Authorize(Roles = Managers), HttpPost("{id:int}/receive")]
    public async Task<IActionResult> Receive(int id, TransferReceiptInput input, CancellationToken cancellationToken)
    {
        if (input.OperationId == Guid.Empty ||
            ((input.Damaged > 0 || input.Missing > 0) && string.IsNullOrWhiteSpace(input.Note)))
            return BadRequest(new { message = "Provide an operation ID and a reason for damaged or missing stock" });
        if (input.Missing > 0 && !User.IsInRole("SuperAdmin") && !User.IsInRole("BranchManager"))
            return Forbid();
        return Result(await transfers.ReceiveAsync(id, Actor(), input, cancellationToken));
    }

    private TransferActor Actor() => new(int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), User.Scope());

    private IActionResult Result(bool success) => success ? Ok(new { success }) :
        Conflict(new { message = "The transfer is unavailable, unauthorized, or its stock has changed" });
}
