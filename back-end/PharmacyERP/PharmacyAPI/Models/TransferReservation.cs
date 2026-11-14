// Links an approved transfer to the exact stock reserved for its dispatch.
namespace PharmacyAPI.Models;

public sealed class TransferReservation
{
    public int TransferRequestId { get; set; }
    public int BatchId { get; set; }
    public int Quantity { get; set; }
    public Batch Batch { get; set; } = null!;
}
