// Identifies committed opening stock imports for safe replay.
namespace PharmacyAPI.Models;

public sealed class OpeningImport
{
    public int Id { get; set; }
    public int LocationId { get; set; }
    public string Fingerprint { get; set; } = "";
    public int RowCount { get; set; }
}
