// Overrides the catalog reorder threshold for one location.
namespace PharmacyAPI.Models;

public sealed class ReorderRule
{
    public int ProductId { get; set; }
    public int LocationId { get; set; }
    public int Minimum { get; set; }
}
