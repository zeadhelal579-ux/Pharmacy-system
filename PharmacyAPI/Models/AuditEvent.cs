// Records the actor and permitted operational metadata for a committed change.
namespace PharmacyAPI.Models;

public sealed class AuditEvent
{
    public long Id { get; set; }
    public int UserId { get; set; }
    public int? LocationId { get; set; }
    public int? DestinationId { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
    public string Entity { get; set; } = "";
    public string Action { get; set; } = "";
    public int? RecordId { get; set; }
    public string? Reason { get; set; }
    public string Fields { get; set; } = "";
}
