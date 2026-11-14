// Records cash adjustments and refunds independently of the original sale.
namespace PharmacyAPI.Models;

public sealed class ShiftMovement
{
    public int Id { get; set; }
    public int ShiftId { get; set; }
    public CashShift Shift { get; set; } = null!;
    public Guid OperationId { get; set; }
    public string Kind { get; set; } = "";
    public string Reason { get; set; } = "";
    public decimal Amount { get; set; }
    public int? SaleItemId { get; set; }
    public SaleItem? SaleItem { get; set; }
    public int? Quantity { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
