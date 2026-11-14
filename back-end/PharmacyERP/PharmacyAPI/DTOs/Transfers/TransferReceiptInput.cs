// Validates the quantities counted at the destination.
using System.ComponentModel.DataAnnotations;

namespace PharmacyAPI.DTOs.Transfers;

public sealed record TransferReceiptInput(Guid OperationId,
    [Range(1, int.MaxValue)] int MovementId, [Range(0, 1000000)] int Accepted,
    [Range(0, 1000000)] int Damaged, [MaxLength(500)] string? Note,
    [Range(0, 1000000)] int Missing = 0);
