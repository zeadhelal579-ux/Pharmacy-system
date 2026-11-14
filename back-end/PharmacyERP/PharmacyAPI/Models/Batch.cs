// ============================================================
// Batch.cs
// ------------------------------------------------------------
// Purpose: EF Core entity representing one incoming shipment
// ("تشغيلة") of a product at a specific location, with its own
// expiry date, quantity, and cost. Multiple batches of the same
// product can exist at the same location simultaneously — FIFO
// selling always picks the batch with the earliest ExpiryDate first.
//
// Structure:
//   - Scalar fields: Id, ProductId, LocationId, BatchNumber
//     (nullable), ExpiryDate, Quantity (defaults 0), Cost (nullable
//     decimal), IsDeleted, CreatedAt, UpdatedAt.
//   - Navigation properties: Product, Location (both required,
//     non-nullable — this is why AddBatch needs a DTO, see
//     InventoryController.cs and CreateBatchDto.cs).
//
// Maps to: the Batches table in SQL Server.
// Referenced by: SaleItem, InventoryTransaction, TransferRequest
// (all point back to a specific Batch).
// ============================================================
namespace PharmacyAPI.Models
{
    public class Batch
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public int LocationId { get; set; }
        public string? BatchNumber { get; set; }
        public DateTime ExpiryDate { get; set; }
        public int Quantity { get; set; } = 0;
        public bool IsQuarantined { get; set; }
        public int ReservedQuantity { get; set; }
        public decimal? Cost { get; set; }
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;

        public Product Product { get; set; } = null!;
        public Location Location { get; set; } = null!;
    }
}
