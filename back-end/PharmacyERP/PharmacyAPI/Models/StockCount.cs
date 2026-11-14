// Captures a physical count against a batch balance at the time of submission.
namespace PharmacyAPI.Models;

public sealed class StockCount
{
    public int Id { get; set; }
    public int BatchId { get; set; }
    public Batch Batch { get; set; } = null!;
    public int Baseline { get; set; }
    public int Counted { get; set; }
    public int CountedBy { get; set; }
    public DateTimeOffset CountedAt { get; set; }
    public string Reason { get; set; } = "";
    public int? ApprovedBy { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
}
