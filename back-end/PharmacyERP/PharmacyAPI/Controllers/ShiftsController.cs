// Opens and reconciles cash shifts for the authenticated operator.
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyAPI.Services;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

namespace PharmacyAPI.Controllers;

[ApiController, Route("api/shifts")]
[Authorize(Roles = "SuperAdmin,BranchManager,Cashier")]
public sealed class ShiftsController(ShiftService shifts, ShiftMovementService movements) : ControllerBase
{
    [HttpGet("current")]
    public async Task<ActionResult<ShiftSummary?>> Current(CancellationToken cancellationToken) =>
        Ok(await shifts.CurrentAsync(Operator(), cancellationToken));

    [HttpPost]
    public async Task<ActionResult<ShiftSummary>> Open(OpenShift request, CancellationToken cancellationToken)
    {
        var shift = await shifts.OpenAsync(Operator(), request.OpeningCash, cancellationToken);
        return shift is null ? Conflict(new { message = "A shift is already open" }) : Ok(shift);
    }

    [HttpPost("{id:int}/close")]
    public async Task<ActionResult<ShiftSummary>> Close(
        int id, CloseShift request, CancellationToken cancellationToken)
    {
        var shift = await shifts.CloseAsync(
            Operator(), new ShiftClosure(id, request.ActualCash, request.Note), cancellationToken);
        return shift is null
            ? Conflict(new { message = "The shift is closed, changed, or requires a note for the cash difference" })
            : Ok(shift);
    }

    [HttpPost("{id:int}/movements")]
    public async Task<ActionResult<MovementSummary>> RecordMovement(
        int id, CashAdjustment request, CancellationToken cancellationToken)
    {
        if (request.OperationId == Guid.Empty || string.IsNullOrWhiteSpace(request.Reason) ||
            decimal.Round(request.Amount, 2) != request.Amount)
            return BadRequest();
        var result = await movements.RecordAsync(Operator(), new MovementRequest(
            id, request.OperationId, request.Kind, request.Reason.Trim(), request.Amount), cancellationToken);
        return result is null ? Conflict(new { message = "Cash movement could not be recorded" }) : Ok(result);
    }

    private ShiftOperator Operator() =>
        new(int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
            int.Parse(User.FindFirstValue("LocationId")!));
}

public sealed record OpenShift([Range(typeof(decimal), "0", "100000000")] decimal OpeningCash);
public sealed record CloseShift(
    [Range(typeof(decimal), "0", "100000000")] decimal ActualCash,
    [MaxLength(500)] string? Note);
public sealed record CashAdjustment(
    Guid OperationId,
    [Required, RegularExpression("^(Deposit|Withdrawal)$")] string Kind,
    [Range(typeof(decimal), "0.01", "100000000")] decimal Amount,
    [Required, MaxLength(500)] string Reason);
