// ============================================================
// Sale.cs
// ------------------------------------------------------------
// Purpose: EF Core entity representing one completed checkout
// (invoice) at a specific location, made by a specific cashier.
//
// Structure:
//   - Scalar fields: Id, LocationId, UserId, TotalAmount,
//     IsDeleted, CreatedAt, UpdatedAt.
//   - Navigation properties: Location, User (both required),
//     SaleItems — collection of individual line items, defaults
//     to non-null empty List<SaleItem>().
//
// Maps to: the Sales table in SQL Server.
// Written by: SalesService.CreateSaleAsync — this is the entity
// whose Id/TotalAmount/CreatedAt get returned to the frontend so
// pos.js can print the invoice immediately after checkout (see
// SalesController.cs review earlier — this only works correctly
// once SalesService returns the full Sale object, not a bool).
// Consumed by: SalesController (GetAll, GetByLocation, GetById),
// SaleRepository (all queries Include Location, User, SaleItems.Product).
// ============================================================
namespace PharmacyAPI.Models
{
    public class Sale
    {
        public int Id { get; set; }
        public int LocationId { get; set; }
        public int UserId { get; set; }
        public decimal TotalAmount { get; set; }
        public decimal DiscountAmount { get; set; }
        public int? DiscountApprovalId { get; set; }
        public string? DiscountReason { get; set; }
        public Guid? OperationId { get; set; }
        public string? RequestFingerprint { get; set; }
        public int? ShiftId { get; set; }
        public CashShift? Shift { get; set; }
        public string? PaymentMethod { get; set; }
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;

        public Location Location { get; set; } = null!;
        public User User { get; set; } = null!;
        public ICollection<SaleItem> SaleItems { get; set; } = new List<SaleItem>();
    }
}
