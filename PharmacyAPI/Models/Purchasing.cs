// Persists supplier orders and the individual batches received against them.
namespace PharmacyAPI.Models;

public sealed class PurchaseOrder
{
    public int Id { get; set; }
    public int SupplierId { get; set; }
    public Supplier Supplier { get; set; } = null!;
    public int LocationId { get; set; }
    public Location Location { get; set; } = null!;
    public int UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public int? ApprovedBy { get; set; }
    public List<PurchaseLine> Lines { get; set; } = [];
}

public sealed class PurchaseLine
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public int Quantity { get; set; }
    public int Received { get; set; }
    public decimal UnitCost { get; set; }
}

public sealed class PurchaseReceipt
{
    public int Id { get; set; }
    public int PurchaseLineId { get; set; }
    public PurchaseLine PurchaseLine { get; set; } = null!;
    public int BatchId { get; set; }
    public Batch Batch { get; set; } = null!;
    public Guid OperationId { get; set; }
    public int UserId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitCost { get; set; }
    public string InvoiceNumber { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
