// ============================================================
// CreateBatchDto.cs
// ------------------------------------------------------------
// Purpose: Request shape for adding a new incoming Batch to a
// product's stock at a specific location.
//
// Structure: ProductId, LocationId (ints), BatchNumber (nullable
// string), ExpiryDate (DateTime), Quantity (int), Cost (nullable
// decimal).
//
// Why this exists: the raw Batch EF model has required non-nullable
// Product/Location navigation properties. Without this DTO,
// POST /api/inventory/batch would fail with "The Product field is
// required." / "The Location field is required." the moment any
// frontend page actually calls it (no page does yet, but this was
// fixed proactively).
//
// Consumed by: InventoryController.AddBatch([FromBody] CreateBatchDto dto).
// Not yet sent by any frontend page — no "add batch" UI exists yet.
// ============================================================
namespace PharmacyAPI.DTOs.Inventory
{
    public class CreateBatchDto
    {
        public int ProductId { get; set; }
        public int LocationId { get; set; }
        public string? BatchNumber { get; set; }
        public DateTime ExpiryDate { get; set; }
        public int Quantity { get; set; }
        public decimal? Cost { get; set; }
    }
}