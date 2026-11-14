// Records stock sent back against a supplier receipt.
namespace PharmacyAPI.Models;

public sealed class SupplierReturn
{
    public int Id { get; set; }
    public int PurchaseReceiptId { get; set; }
    public PurchaseReceipt PurchaseReceipt { get; set; } = null!;
    public Guid OperationId { get; set; }
    public int Quantity { get; set; }
    public string Reason { get; set; } = "";
    public int UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
