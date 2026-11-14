// Advances transfers through approval, dispatch and partial receipt.
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.DTOs.Transfers;
using PharmacyAPI.Models;

namespace PharmacyAPI.Services;

public sealed class TransferService(AppDbContext context, InventoryService inventory, TimeProvider clock)
{
    public Task<List<TransferRequest>> GetAllTransfersAsync(int? location) =>
        context.TransferRequests.AsNoTracking().Where(item => !item.IsDeleted &&
            (location == null || item.FromLocationId == location || item.ToLocationId == location))
            .Include(item => item.Product).Include(item => item.FromLocation).Include(item => item.ToLocation)
            .OrderByDescending(item => item.Id).Take(100).ToListAsync();

    public async Task<bool> RequestTransferAsync(CreateTransferDto input, int userId)
    {
        if (input.Quantity is < 1 or > 1000000 || input.FromLocationId == input.ToLocationId ||
            !await context.Locations.AnyAsync(item => item.Id == input.ToLocationId && !item.IsDeleted))
            return false;
        var today = clock.GetLocalNow().Date;
        var batchId = await context.BatchesOutsideRecall.Where(batch => batch.ProductId == input.ProductId &&
            batch.LocationId == input.FromLocationId && !batch.IsDeleted && !batch.IsQuarantined &&
            !batch.Product.IsDeleted && !batch.Location.IsDeleted && batch.Quantity > batch.ReservedQuantity && batch.ExpiryDate >= today &&
            (input.BatchId == 0 || batch.Id == input.BatchId))
            .OrderBy(batch => batch.ExpiryDate).ThenBy(batch => batch.Id)
            .Select(batch => (int?)batch.Id).FirstOrDefaultAsync();
        if (!batchId.HasValue) return false;

        context.TransferRequests.Add(new TransferRequest
        {
            ProductId = input.ProductId, FromLocationId = input.FromLocationId,
            ToLocationId = input.ToLocationId, BatchId = batchId.Value, Quantity = input.Quantity,
            RequestedByUserId = userId, Status = "Pending"
        });
        await context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> DecideAsync(int id, TransferActor actor, bool approve, CancellationToken cancellationToken)
    {
        var transfer = await FindAsync(id, cancellationToken);
        if (transfer is null || !actor.Allows(transfer.FromLocationId) || transfer.RequestedByUserId == actor.UserId)
            return false;
        var status = approve ? "ReadyToShip" : "Rejected";
        if (transfer.Status == status) return transfer.ApprovedByUserId == actor.UserId;
        if (transfer.Status != "Pending" && (approve || transfer.Status != "ReadyToShip")) return false;
        if (approve)
        {
            var parts = await inventory.PlanAsync(Allocation(transfer, actor), cancellationToken);
            if (parts is null) return false;
            foreach (var part in parts)
            {
                part.Batch.ReservedQuantity += part.Quantity;
                context.TransferReservations.Add(new TransferReservation
                {
                    TransferRequestId = id, BatchId = part.Batch.Id, Quantity = part.Quantity
                });
            }
        }
        else if (transfer.Status == "ReadyToShip")
        {
            var reservations = await ReservationsAsync(id, cancellationToken);
            foreach (var item in reservations) item.Batch.ReservedQuantity -= item.Quantity;
            context.TransferReservations.RemoveRange(reservations);
        }
        transfer.Status = status;
        transfer.ApprovedByUserId = actor.UserId;
        return await SaveAsync(transfer, cancellationToken);
    }

    public async Task<bool> ShipAsync(int id, TransferActor actor, CancellationToken cancellationToken)
    {
        var transfer = await FindAsync(id, cancellationToken);
        if (transfer is null || !actor.Allows(transfer.FromLocationId)) return false;
        if (transfer.Status is "InTransit" or "PartiallyReceived" or "Received") return true;
        if (transfer.Status != "ReadyToShip") return false;

        var movement = Allocation(transfer, actor);
        var reservations = await ReservationsAsync(id, cancellationToken);
        if (reservations.Count == 0)
        {
            // Orders approved before reservations were introduced use free stock once.
            if (await inventory.AllocateAsync(movement, cancellationToken) is null) return false;
        }
        else
        {
            var today = clock.GetLocalNow().Date;
            var ids = reservations.Select(item => item.BatchId).ToArray();
            var eligible = await context.BatchesOutsideRecall.CountAsync(batch => ids.Contains(batch.Id) &&
                !batch.IsQuarantined && !batch.IsDeleted && !batch.Product.IsDeleted &&
                batch.ExpiryDate >= today, cancellationToken);
            if (eligible != ids.Length || reservations.Sum(item => item.Quantity) != transfer.Quantity) return false;
            foreach (var item in reservations)
            {
                item.Batch.ReservedQuantity -= item.Quantity;
                context.InventoryTransactions.Add(inventory.Dispatch(movement, item.Batch, item.Quantity));
            }
            context.TransferReservations.RemoveRange(reservations);
        }
        transfer.Status = "InTransit";
        return await SaveAsync(transfer, cancellationToken);
    }

    private Task<List<TransferReservation>> ReservationsAsync(int id, CancellationToken token) =>
        context.TransferReservations.Include(item => item.Batch)
            .Where(item => item.TransferRequestId == id).ToListAsync(token);

    private static StockAllocation Allocation(TransferRequest transfer, TransferActor actor) =>
        new(transfer.ProductId, transfer.FromLocationId, transfer.Quantity, actor.UserId, transfer.ToLocationId, transfer.Id);

    public async Task<List<ShipmentLine>?> ShipmentAsync(int id, TransferActor actor, CancellationToken cancellationToken)
    {
        var transfer = await FindAsync(id, cancellationToken);
        if (transfer is null || (!actor.Allows(transfer.FromLocationId) && !actor.Allows(transfer.ToLocationId)))
            return null;
        return await LinesAsync(id, cancellationToken);
    }

    public async Task<bool> ReceiveAsync(
        int id, TransferActor actor, TransferReceiptInput input, CancellationToken cancellationToken)
    {
        var transfer = await FindAsync(id, cancellationToken);
        if (transfer is null || !actor.Allows(transfer.ToLocationId)) return false;
        var existing = await context.TransferReceipts.AsNoTracking().SingleOrDefaultAsync(
            item => item.TransferRequestId == id && item.OperationId == input.OperationId, cancellationToken);
        if (existing is not null) return Matches(existing, input);
        if (transfer.Status is not ("InTransit" or "PartiallyReceived")) return false;

        var lines = await LinesAsync(id, cancellationToken);
        var line = lines.SingleOrDefault(item => item.Id == input.MovementId);
        var quantity = input.Accepted + input.Damaged + input.Missing;
        if (line is null || quantity <= 0 || quantity > line.Remaining) return false;
        if (input.Missing > 0 && quantity != line.Remaining) return false;

        var movement = await Dispatches(id).Include(item => item.Batch)
            .SingleAsync(item => item.Id == input.MovementId, cancellationToken);
        // A concurrent hold at the source invalidates the receipt's view of the lot.
        movement.Batch.UpdatedAt = clock.GetUtcNow().UtcDateTime;
        context.Entry(movement.Batch).Property(batch => batch.UpdatedAt).IsModified = true;
        AddReceivedBatch(transfer, movement.Batch, input.Accepted, quarantined: false);
        AddReceivedBatch(transfer, movement.Batch, input.Damaged, quarantined: true);
        context.TransferReceipts.Add(new TransferReceipt
        {
            TransferRequestId = id, MovementId = movement.Id, OperationId = input.OperationId,
            Accepted = input.Accepted, Damaged = input.Damaged, Missing = input.Missing, Note = input.Note?.Trim(),
            UserId = actor.UserId, CreatedAt = clock.GetUtcNow()
        });
        transfer.Status = lines.Sum(item => item.Remaining) == quantity ? "Received" : "PartiallyReceived";
        // Force a version check even when a second partial receipt leaves the status unchanged.
        context.Entry(transfer).Property(item => item.Status).IsModified = true;
        if (await SaveAsync(transfer, cancellationToken)) return true;
        var note = input.Note?.Trim();
        return await context.TransferReceipts.AsNoTracking().AnyAsync(item =>
            item.TransferRequestId == id && item.OperationId == input.OperationId &&
            item.MovementId == input.MovementId && item.Accepted == input.Accepted &&
            item.Damaged == input.Damaged && item.Missing == input.Missing && item.Note == note, cancellationToken);
    }

    private void AddReceivedBatch(TransferRequest transfer, Batch source, int quantity, bool quarantined)
    {
        if (quantity <= 0) return;
        context.Batches.Add(new Batch
        {
            ProductId = transfer.ProductId, LocationId = transfer.ToLocationId, BatchNumber = source.BatchNumber,
            ExpiryDate = source.ExpiryDate, Quantity = quantity, Cost = source.Cost,
            IsQuarantined = quarantined || source.IsQuarantined || source.ExpiryDate < clock.GetLocalNow().Date
        });
    }

    private IQueryable<InventoryTransaction> Dispatches(int id) =>
        context.InventoryTransactions.Where(item => item.Type == "TransferDispatch" && item.ReferenceId == id);

    private Task<List<ShipmentLine>> LinesAsync(int id, CancellationToken cancellationToken) =>
        Dispatches(id).OrderBy(item => item.Id).Select(item => new ShipmentLine(
            item.Id, item.Batch.BatchNumber, item.Batch.ExpiryDate, item.Quantity,
            context.TransferReceipts.Where(receipt => receipt.MovementId == item.Id).Sum(receipt => receipt.Accepted),
            context.TransferReceipts.Where(receipt => receipt.MovementId == item.Id).Sum(receipt => receipt.Damaged),
            context.TransferReceipts.Where(receipt => receipt.MovementId == item.Id).Sum(receipt => receipt.Missing)))
            .ToListAsync(cancellationToken);

    private Task<TransferRequest?> FindAsync(int id, CancellationToken cancellationToken) =>
        context.TransferRequests.SingleOrDefaultAsync(item => item.Id == id && !item.IsDeleted, cancellationToken);

    private async Task<bool> SaveAsync(TransferRequest transfer, CancellationToken cancellationToken)
    {
        transfer.UpdatedAt = clock.GetUtcNow().UtcDateTime;
        try
        {
            await context.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateException error) when (error is DbUpdateConcurrencyException ||
            error.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 })
        {
            context.ChangeTracker.Clear();
            return false;
        }
    }

    private static bool Matches(TransferReceipt receipt, TransferReceiptInput input) =>
        receipt.MovementId == input.MovementId && receipt.Accepted == input.Accepted &&
        receipt.Damaged == input.Damaged && receipt.Missing == input.Missing && receipt.Note == input.Note?.Trim();
}

public sealed record TransferActor(int UserId, int? LocationId)
{
    public bool Allows(int location) => LocationId is null || LocationId == location;
}

public sealed record ShipmentLine(int Id, string? BatchNumber, DateTime ExpiryDate, int Shipped, int Accepted, int Damaged, int Missing)
{
    public int Remaining => Shipped - Accepted - Damaged - Missing;
}
