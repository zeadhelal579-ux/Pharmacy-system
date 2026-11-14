// Builds audit rows from a fixed allowlist without copying raw request payloads or credentials.
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using PharmacyAPI.Models;

namespace PharmacyAPI.Data;

internal static class OperationalAudit
{
    internal static IEnumerable<AuditEvent> Capture(ChangeTracker tracker, ClaimsPrincipal actor)
    {
        if (actor.Identity?.IsAuthenticated != true ||
            !int.TryParse(actor.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) yield break;

        var now = DateTimeOffset.UtcNow;
        foreach (var entry in tracker.Entries().Where(entry => entry.State is EntityState.Added or EntityState.Modified))
        {
            var details = Details(entry.Entity, tracker);
            if (details is null) continue;
            var (location, destination, reason) = details.Value;
            var fields = entry.Properties.Where(property => property.IsModified && !property.Metadata.IsShadowProperty() &&
                property.Metadata.Name is not ("PasswordHash" or "Revision" or "UpdatedAt" or "RequestFingerprint"))
                .Select(property => property.Metadata.Name).Order(StringComparer.Ordinal);
            var id = entry.Properties.SingleOrDefault(property => property.Metadata.Name == "Id");
            yield return new AuditEvent
            {
                UserId = userId, LocationId = location, DestinationId = destination,
                OccurredAt = now, Entity = entry.Metadata.ClrType.Name,
                Action = entry.State == EntityState.Added ? "Created" :
                    entry.Properties.Any(property => property.Metadata.Name == "IsDeleted" && property.IsModified &&
                        property.CurrentValue is true) ? "Archived" : "Updated",
                RecordId = id is { IsTemporary: false, CurrentValue: int value } ? value : null,
                Reason = reason, Fields = string.Join(", ", fields)
            };
        }
    }

    private static (int?, int?, string?)? Details(object entity, ChangeTracker tracker) => entity switch
    {
        User user => (user.LocationId, null, null),
        Product => (null, null, null),
        Supplier => (null, null, null),
        Sale sale => (sale.LocationId, null, sale.DiscountReason),
        DiscountApproval approval => (approval.LocationId, null, approval.Reason),
        PurchaseReceipt item => (item.Batch?.LocationId, null, null),
        SupplierReturn item => (tracker.Entries<Batch>().FirstOrDefault(batch => batch.State == EntityState.Modified)
            ?.Entity.LocationId, null, item.Reason),
        CashShift shift when shift.ClosedAt.HasValue => (shift.LocationId, null, shift.CloseNote),
        CashShift shift when tracker.EntryState(shift) == EntityState.Added => (shift.LocationId, null, null),
        ShiftMovement item => (tracker.Entries<CashShift>().FirstOrDefault(shift => shift.Entity.Id == item.ShiftId)
            ?.Entity.LocationId, null, item.Reason),
        BatchStatusChange item => (tracker.Entries<Batch>().FirstOrDefault(batch => batch.Entity.Id == item.BatchId)
            ?.Entity.LocationId, null, item.Reason),
        LotRecall recall => (null, null, recall.ClosedAt.HasValue ? recall.CloseReason : recall.Reason),
        PurchaseOrder order => (order.LocationId, null, null),
        TransferRequest transfer => (transfer.FromLocationId, transfer.ToLocationId, null),
        TransferReceipt item => TransferDetails(item, tracker),
        StockCount count => (tracker.Entries<Batch>().FirstOrDefault(batch => batch.Entity.Id == count.BatchId)
            ?.Entity.LocationId, null, count.Reason),
        ReorderRule rule => (rule.LocationId, null, null),
        OpeningImport import => (import.LocationId, null, null),
        _ => null
    };

    private static (int?, int?, string?) TransferDetails(TransferReceipt item, ChangeTracker tracker)
    {
        var transfer = tracker.Entries<TransferRequest>().FirstOrDefault(entry => entry.Entity.Id == item.TransferRequestId)?.Entity;
        return (transfer?.FromLocationId, transfer?.ToLocationId, item.Note);
    }

    private static EntityState EntryState(this ChangeTracker tracker, CashShift shift) =>
        tracker.Entries<CashShift>().Single(entry => ReferenceEquals(entry.Entity, shift)).State;
}
