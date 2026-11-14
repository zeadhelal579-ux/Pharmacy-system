// ============================================================
// SalesController.cs
// ------------------------------------------------------------
// Purpose: Handles reading past sales and creating new ones (checkout).
//
// Structure:
//   1. [Authorize] on the class — any logged-in user can read.
//   2. [Authorize(Roles = "SuperAdmin,BranchManager,Cashier")] on
//      CreateSale specifically — WarehouseAdmin cannot process
//      sales, matching the agreed permission matrix (the warehouse
//      doesn't sell directly to customers).
//   3. Constructor (top) — injects ISaleRepository (reads) and
//      SalesService (writes/business logic).
//   4. GET / — all sales, GET location/{id} — sales for one branch,
//      GET {id} — single sale by Id.
//   5. POST / — creates a sale. SECURITY FIX: LocationId is no
//      longer trusted from the request body. It is read directly
//      from the caller's own JWT "LocationId" claim, so a Cashier
//      physically logged in at Branch 1 can never record a sale
//      as if it happened at Branch 2 or the warehouse, no matter
//      what the client sends. UserId is likewise taken from the
//      token's NameIdentifier claim, not the body.
//
// Architecture note (consistency pass): CreateSaleRequest/SaleItemRequest
// previously lived as inline classes at the bottom of this file,
// duplicating DTOs/Sales/CreateSaleDto.cs. That DTO has been corrected
// to match this controller's actual accepted shape (LocationId/UserId
// dropped) and is now the one bound to directly — same JSON shape,
// no behavior change, one less duplicate definition.
//
// IMPORTANT DEPENDENCY: relies on SalesService.CreateSaleAsync
// returning the full Sale object (Task<Sale?>), not a bool — see
// the earlier transaction-safety fix in Services/SalesService.cs.
// Consumed by: pos.js via api.sales.create(payload). The frontend
// currently still sends locationId/userId in its payload; these
// values are still silently ignored by the server, which is safe and
// requires no frontend change.
// ============================================================
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyAPI.DTOs.Sales;
using PharmacyAPI.Repositories;
using PharmacyAPI.Services;
using System.Security.Claims;

namespace PharmacyAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class SalesController : ControllerBase
    {
        private readonly ISaleRepository _saleRepository;
        private readonly SalesService _salesService;

        public SalesController(ISaleRepository saleRepository, SalesService salesService)
        {
            _saleRepository = saleRepository;
            _salesService = salesService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var sales = User.Scope() is int scope
                ? await _saleRepository.GetByLocationAsync(scope)
                : await _saleRepository.GetAllAsync();
            return Ok(sales);
        }

        [HttpGet("location/{locationId}")]
        public async Task<IActionResult> GetByLocation(int locationId)
        {
            if (!User.CanAccess(locationId)) return Forbid();
            var sales = await _saleRepository.GetByLocationAsync(locationId);
            return Ok(sales);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var sale = await _saleRepository.GetByIdAsync(id);
            if (sale == null || !User.CanAccess(sale.LocationId)) return NotFound();
            return Ok(sale);
        }

        [Authorize(Roles = "SuperAdmin,BranchManager,Cashier")]
        [HttpGet("operations/{operationId:guid}")]
        public async Task<IActionResult> Operation(Guid operationId, CancellationToken cancellationToken)
        {
            var saleId = await _salesService.GetCompletedOperationAsync(
                GetCurrentUserId(), GetCurrentUserLocationId(), operationId, cancellationToken);
            return saleId.HasValue ? Ok(new { saleId }) : NotFound();
        }

        [Authorize(Roles = "SuperAdmin,BranchManager,Cashier")]
        [HttpPost("{id:int}/returns")]
        public async Task<ActionResult<MovementSummary>> Return(
            int id, SaleReturn request, [FromServices] ShiftMovementService movements,
            CancellationToken cancellationToken)
        {
            if (request.OperationId == Guid.Empty || string.IsNullOrWhiteSpace(request.Reason))
                return BadRequest();
            var actor = new ShiftOperator(GetCurrentUserId(), GetCurrentUserLocationId());
            var result = await movements.RecordAsync(actor, new MovementRequest(
                request.ShiftId, request.OperationId, "SaleRefund", request.Reason.Trim(),
                SaleId: id, SaleItemId: request.SaleItemId, Quantity: request.Quantity), cancellationToken);
            return result is null ? Conflict(new { message = "Refund could not be recorded" }) : Ok(result);
        }

        [Authorize(Roles = "SuperAdmin,BranchManager,Cashier")]
        [HttpPost]
        public async Task<IActionResult> CreateSale(
            [FromBody] CreateSaleDto request,
            [FromHeader(Name = "Idempotency-Key")] Guid? operationId,
            CancellationToken cancellationToken)
        {
            var locationId = GetCurrentUserLocationId();
            var userId = GetCurrentUserId();

            if (request.Items.Any(item => item is null))
                return BadRequest(new { message = "Every sale line is required" });
            if (operationId == Guid.Empty || request.ShiftId.HasValue != (request.PaymentMethod is not null))
                return BadRequest(new { message = "Provide a valid operation key and matching shift and payment details" });

            var sale = await _salesService.CreateSaleAsync(
                new SaleRequest(locationId, userId, request, operationId), cancellationToken);
            if (sale == null) return Conflict(new { message = "Stock, pricing or discount approval is unavailable" });

            return Ok(new
            {
                message = "Sale created successfully",
                saleId = sale.Id,
                totalAmount = sale.TotalAmount,
                createdAt = sale.CreatedAt
            });
        }

        private int GetCurrentUserId()
        {
            var idClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.Parse(idClaim!);
        }

        private int GetCurrentUserLocationId()
        {
            var locationClaim = User.FindFirst("LocationId")?.Value;
            return int.Parse(locationClaim!);
        }
    }
}

public sealed record SaleReturn(
    [System.ComponentModel.DataAnnotations.Range(1, int.MaxValue)] int ShiftId,
    Guid OperationId,
    [System.ComponentModel.DataAnnotations.Range(1, int.MaxValue)] int SaleItemId,
    [System.ComponentModel.DataAnnotations.Range(1, 100000)] int Quantity,
    [System.ComponentModel.DataAnnotations.Required, System.ComponentModel.DataAnnotations.MaxLength(500)] string Reason);
