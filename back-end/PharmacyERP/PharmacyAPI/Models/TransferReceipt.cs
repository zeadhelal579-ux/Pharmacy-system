// Records the accepted and damaged quantities on a transfer shipment line.
namespace PharmacyAPI.Models;

public sealed class TransferReceipt
{
    public int Id { get; set; }
    public int TransferRequestId { get; set; }
    public TransferRequest TransferRequest { get; set; } = null!;
    public int MovementId { get; set; }
    public InventoryTransaction Movement { get; set; } = null!;
    public Guid OperationId { get; set; }
    public int Accepted { get; set; }
    public int Damaged { get; set; }
    public int Missing { get; set; }
    public string? Note { get; set; }
    public int UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
