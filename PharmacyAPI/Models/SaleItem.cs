// ============================================================
// SaleItem.cs
// ------------------------------------------------------------
// Purpose: EF Core entity representing one line item within a
// Sale (invoice) — one product, one specific batch, a quantity,
// and the price it was sold at.
//
// Structure:
//   - Scalar fields: Id, SaleId, ProductId, BatchId, Quantity,
//     UnitPrice, IsDeleted, CreatedAt, UpdatedAt.
//   - Navigation properties: Sale, Product, Batch (all required).
//
// Maps to: the SaleItems table in SQL Server.
// Why BatchId is stored per line item: this locks in exactly which
// batch was sold from at the moment of sale (FIFO-selected), even
// if that batch's remaining quantity or expiry changes later —
// the invoice always reflects the true batch used.
// Written by: SalesService.CreateSaleAsync (one row per cart item).
// Consumed by: SaleRepository queries (.Include(s => s.SaleItems)
// .ThenInclude(si => si.Product)), used to render invoice line
// items in print-invoice.html.
// ============================================================
namespace PharmacyAPI.Models
{
    public class SaleItem
    {
        public int Id { get; set; }
        public int SaleId { get; set; }
        public int ProductId { get; set; }
        public int BatchId { get; set; }
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public string? SoldUnit { get; set; }
        public int? UnitsPerPack { get; set; }
        public decimal? Amount { get; set; }
        public int? LineNumber { get; set; }
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;

        public Sale Sale { get; set; } = null!;
        public Product Product { get; set; } = null!;
        public Batch Batch { get; set; } = null!;
    }
}
