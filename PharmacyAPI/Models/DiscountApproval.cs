// Records a manager decision for a specific operator, shift and discount request.
namespace PharmacyAPI.Models;

public sealed class DiscountApproval
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int LocationId { get; set; }
    public int ShiftId { get; set; }
    public decimal Amount { get; set; }
    public string Cart { get; set; } = "";
    public string Reason { get; set; } = "";
    public DateTimeOffset RequestedAt { get; set; }
    public int? DecidedBy { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
    public bool? Approved { get; set; }
    public bool Used { get; set; }
}
