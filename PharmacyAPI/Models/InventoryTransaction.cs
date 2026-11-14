// ============================================================
// InventoryTransaction.cs
// ------------------------------------------------------------
// Purpose: EF Core entity that logs every single stock movement
// in the system — a permanent audit trail of who moved what,
// how much, from where, to where, and why (Sale or Transfer).
//
// Structure:
//   - Scalar fields: Id, ProductId, BatchId, FromLocationId
//     (nullable — null for a pure sale, since stock only leaves
//     one location), ToLocationId (nullable — only set for
//     Transfer type), Quantity, Type (string: "Sale" or
//     "Transfer"), ReferenceId (nullable, currently unused —
//     intended to link back to the Sale.Id or TransferRequest.Id
//     that caused this row, but no code currently sets it), UserId,
//     IsDeleted, CreatedAt, UpdatedAt.
//   - Navigation properties: Product, Batch, User (all required),
//     FromLocation, ToLocation (both nullable, matching the
//     nullable FK fields above).
//
// Maps to: the InventoryTransactions table in SQL Server.
// Written by: InventoryService.SellProductAsync (Type="Sale") and
// InventoryService.TransferProductAsync (Type="Transfer"). Never
// read back anywhere yet — no report or screen currently queries
// this table, even though every write to it succeeds correctly.
// ============================================================
namespace PharmacyAPI.Models
{
    public class InventoryTransaction
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public int BatchId { get; set; }
        public int? FromLocationId { get; set; }
        public int? ToLocationId { get; set; }
        public int Quantity { get; set; }
        public string Type { get; set; } = string.Empty;
        public int? ReferenceId { get; set; }
        public int UserId { get; set; }
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;

        public Product Product { get; set; } = null!;
        public Batch Batch { get; set; } = null!;
        public Location? FromLocation { get; set; }
        public Location? ToLocation { get; set; }
        public User User { get; set; } = null!;
    }
}