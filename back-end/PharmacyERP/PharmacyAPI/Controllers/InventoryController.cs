// ============================================================
// InventoryController.cs
// ------------------------------------------------------------
// Purpose: Read/write access to Batch data — stock levels per
// product per location, plus adding new incoming batches.
//
// Structure:
//   1. [Authorize] on the class — any logged-in user can read
//      (GET) stock data, since every role needs visibility into
//      inventory (Cashier to sell, BranchManager to manage,
//      WarehouseAdmin/SuperAdmin to oversee).
//   2. [Authorize(Roles = "SuperAdmin,WarehouseAdmin")] on AddBatch
//      specifically — matches the agreed permission matrix: only
//      the central warehouse admin (or SuperAdmin) can register new
//      incoming stock. BranchManager and Cashier cannot create
//      batches out of nowhere — new stock only enters the system
//      through the warehouse, then reaches branches via Transfers.
//   3. Constructor (top) — injects IInventoryRepository and
//      InventoryService (still unused directly here, kept for
//      future endpoints like manual stock adjustments).
//   4. GET location/{locationId} — all batches at one branch/warehouse.
//   5. GET product/{productId} — all batches of one product, across
//      all locations.
//   6. GET stock/{productId}/{locationId} — total summed quantity.
//   7. POST batch — creates a new Batch row via CreateBatchDto
//      (raw Batch model has required non-nullable Product/Location
//      navigation properties, so a DTO is required here regardless
//      of the role check).
//
// Architecture note (consistency pass): AddBatch previously referenced
// its DTO by a fully-qualified inline name (PharmacyAPI.DTOs.Inventory.
// CreateBatchDto) instead of a using statement, unlike every other
// controller in the project. Purely cosmetic — a using statement was
// added and the parameter type shortened to match the rest of the codebase.
//
// Consumed by: inventory.js (GetByLocation), pos.js (GetByLocation).
// AddBatch is not yet called by any current frontend page, but is
// now correctly locked down ahead of that feature being built.
// ============================================================
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyAPI.DTOs.Inventory;
using PharmacyAPI.Repositories;
using PharmacyAPI.Models;
using PharmacyAPI.Services;

namespace PharmacyAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class InventoryController : ControllerBase
    {
        private readonly IInventoryRepository _inventoryRepository;
        public InventoryController(IInventoryRepository inventoryRepository)
        {
            _inventoryRepository = inventoryRepository;
        }

        [HttpGet("location/{locationId}")]
        public async Task<IActionResult> GetByLocation(int locationId,
            [FromServices] PharmacyAPI.Data.AppDbContext context, [FromQuery] bool includeEmpty = false)
        {
            if (!User.CanAccess(locationId)) return Forbid();
            var batches = await _inventoryRepository.GetBatchesByLocationAsync(locationId, includeEmpty);
            var recalls = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToListAsync(
                context.ActiveLotRecalls.Select(item => new { item.ProductId, item.Lot }), HttpContext.RequestAborted);
            var active = recalls.ToLookup(item => item.ProductId);
            foreach (var batch in batches)
            {
                if (active[batch.ProductId].Any(item => string.Equals(item.Lot, batch.BatchNumber, StringComparison.OrdinalIgnoreCase)))
                    batch.IsQuarantined = true;
            }
            return Ok(batches);
        }

        [HttpGet("product/{productId}")]
        public async Task<IActionResult> GetByProduct(int productId)
        {
            var batches = await _inventoryRepository.GetBatchesByProductAsync(productId, User.Scope());
            return Ok(batches);
        }

        [HttpGet("stock/{productId}/{locationId}")]
        public async Task<IActionResult> GetStock(int productId, int locationId)
        {
            if (!User.CanAccess(locationId)) return Forbid();
            var stock = await _inventoryRepository.GetTotalStockAsync(productId, locationId);
            return Ok(new { productId, locationId, stock });
        }

        [Authorize(Roles = "SuperAdmin,WarehouseAdmin")]
        [HttpPost("batch")]
        public async Task<IActionResult> AddBatch([FromBody] CreateBatchDto dto)
        {
            if (!User.CanAccess(dto.LocationId)) return Forbid();
            if (dto.Quantity <= 0 || dto.Cost < 0 || dto.ExpiryDate.Date < DateTime.Today)
                return BadRequest(new { message = "Provide a positive quantity and a valid expiry date and cost" });
            var batch = new Batch
            {
                ProductId = dto.ProductId,
                LocationId = dto.LocationId,
                BatchNumber = dto.BatchNumber,
                ExpiryDate = dto.ExpiryDate,
                Quantity = dto.Quantity,
                Cost = dto.Cost
            };

            await _inventoryRepository.AddBatchAsync(batch);
            return Ok(batch);
        }
    }
}
