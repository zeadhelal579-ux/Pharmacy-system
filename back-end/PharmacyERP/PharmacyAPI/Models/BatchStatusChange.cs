// Preserves the reason and responsible user for a batch status change.
namespace PharmacyAPI.Models;

public sealed class BatchStatusChange
{
    public int Id { get; set; }
    public int BatchId { get; set; }
    public Batch Batch { get; set; } = null!;
    public bool Quarantined { get; set; }
    public string Reason { get; set; } = "";
    public int UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
