// Stores the opening and closing reconciliation for an operator's shift.
namespace PharmacyAPI.Models;

public sealed class CashShift
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int LocationId { get; set; }
    public decimal OpeningCash { get; set; }
    public DateTimeOffset OpenedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public decimal? ActualCash { get; set; }
    public decimal? ExpectedCash { get; set; }
    public string? CloseNote { get; set; }
    public Guid Revision { get; set; }
    public ICollection<Sale> Sales { get; set; } = [];
}
