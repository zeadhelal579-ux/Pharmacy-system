// Validates supplier, order and receiving inputs at the API boundary.
using System.ComponentModel.DataAnnotations;

namespace PharmacyAPI.DTOs;

public sealed record SupplierInput([Required, MaxLength(150)] string Name, [MaxLength(150)] string? Contact);
public sealed record OrderInput([Range(1, int.MaxValue)] int SupplierId,
    [Range(1, int.MaxValue)] int LocationId, [Required, MinLength(1), MaxLength(100)] OrderLineInput[] Lines);
public sealed record OrderLineInput([Range(1, int.MaxValue)] int ProductId,
    [Range(1, 1000000)] int Quantity, [Range(typeof(decimal), "0", "1000000")] decimal UnitCost);
public sealed record ReceiptInput(Guid OperationId, [Range(1, int.MaxValue)] int LineId,
    [Range(1, 1000000)] int Quantity, [Range(typeof(decimal), "0", "1000000")] decimal UnitCost,
    [Required, MaxLength(80)] string BatchNumber, DateOnly ExpiryDate,
    [Required, MaxLength(80)] string InvoiceNumber);

public sealed record SupplierReturnInput(Guid OperationId,
    [Range(1, 1000000)] int Quantity, [Required, MaxLength(500)] string Reason);
