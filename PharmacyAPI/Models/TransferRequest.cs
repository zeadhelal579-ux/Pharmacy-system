// ============================================================
// TransferRequest.cs
// ------------------------------------------------------------
// Purpose: EF Core entity representing a request to move stock
// from one location to another — goes through a Pending →
// Approved/Rejected workflow before any actual stock movement happens.
//
// Structure:
//   - Scalar fields: Id, FromLocationId, ToLocationId, ProductId,
//     BatchId, Quantity, Status (string, defaults "Pending" —
//     also "Approved" or "Rejected", not an enum), RequestedByUserId,
//     ApprovedByUserId (nullable — only set once approved/rejected),
//     IsDeleted, CreatedAt, UpdatedAt.
//   - Navigation properties: FromLocation, ToLocation, Product,
//     Batch, RequestedByUser (all required), ApprovedByUser (nullable,
//     matching the nullable FK above).
//
// Maps to: the TransferRequests table in SQL Server.
// Lifecycle: created by TransferService.RequestTransferAsync
// (Status="Pending") → either TransferService.ApproveTransferAsync
// (moves stock via InventoryService, then Status="Approved") or
// TransferService.RejectTransferAsync (Status="Rejected", no stock
// movement, ApprovedByUserId still gets set to record who rejected it).
// Consumed by: TransfersController.GetAll() (with Product/
// FromLocation/ToLocation included), rendered in transfers.js.
// ============================================================
namespace PharmacyAPI.Models
{
    public class TransferRequest
    {
        public int Id { get; set; }
        public int FromLocationId { get; set; }
        public int ToLocationId { get; set; }
        public int ProductId { get; set; }
        public int BatchId { get; set; }
        public int Quantity { get; set; }
        public string Status { get; set; } = "Pending";
        public int RequestedByUserId { get; set; }
        public int? ApprovedByUserId { get; set; }
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;

        public Location FromLocation { get; set; } = null!;
        public Location ToLocation { get; set; } = null!;
        public Product Product { get; set; } = null!;
        public Batch Batch { get; set; } = null!;
        public User RequestedByUser { get; set; } = null!;
        public User? ApprovedByUser { get; set; }
    }
}