// ============================================================
// Product.cs
// ------------------------------------------------------------
// Purpose: EF Core entity representing one medicine/item in the
// catalog — NOT tied to a specific location or quantity; that
// lives in Batch. Product just holds the shared attributes (name,
// price, barcode) that are the same across every branch.
//
// Structure:
//   - Scalar fields: Id, Name, Barcode (nullable, unique in DB),
//     Category, Unit (both nullable), MinStock (defaults 10 —
//     used by ReportService's shortage-alert scan), SellPrice,
//     BuyPrice, IsDeleted, CreatedAt, UpdatedAt.
//   - Navigation property: Batches — a collection, defaults to a
//     non-null empty List<Batch>(). This is why ProductsController
//     can safely bind the raw model directly (no required-reference
//     validation issue, unlike User/Batch which have single
//     required navigation properties).
//
// Maps to: the Products table in SQL Server.
// Consumed by: ProductsController (full CRUD), and referenced from
// Batch, SaleItem, InventoryTransaction, ShortageAlert as a foreign key.
// ============================================================
namespace PharmacyAPI.Models
{
    public class Product
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Barcode { get; set; }
        public string? Category { get; set; }
        public string? Unit { get; set; }
        public int MinStock { get; set; } = 10;
        public decimal SellPrice { get; set; }
        public string? PackName { get; set; }
        public string? PackBarcode { get; set; }
        public int? PackSize { get; set; }
        public decimal? PackPrice { get; set; }
        public decimal BuyPrice { get; set; }
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;

        public ICollection<Batch> Batches { get; set; } = new List<Batch>();
    }
}
