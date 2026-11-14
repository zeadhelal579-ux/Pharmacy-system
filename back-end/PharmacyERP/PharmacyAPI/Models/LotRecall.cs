// Holds a named lot across the chain until an authorized operator closes the recall.
namespace PharmacyAPI.Models;

public sealed class LotRecall
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public string Lot { get; set; } = "";
    public string Reason { get; set; } = "";
    public int OpenedBy { get; set; }
    public DateTimeOffset OpenedAt { get; set; }
    public int? ClosedBy { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public string? CloseReason { get; set; }
}
