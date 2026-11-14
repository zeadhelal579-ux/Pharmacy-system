// ============================================================
// Location.cs
// ------------------------------------------------------------
// Purpose: EF Core entity representing either the central
// warehouse or one of the branches.
//
// Structure:
//   - Scalar fields: Id, Name, Type (string: "warehouse" or
//     "branch" — not an enum, just a plain string convention
//     enforced only by the seed data, not by the database itself),
//     Address (nullable), IsDeleted, CreatedAt, UpdatedAt.
//   - No navigation properties on this side — Location is
//     referenced BY many other tables (User, Batch, Sale,
//     TransferRequest, InventoryTransaction, ShortageAlert) but
//     doesn't declare collection navigation properties back to them.
//
// Maps to: the Locations table in SQL Server.
// Seed data: 4 rows — Central Warehouse (Id=1, warehouse),
// Branch 1/2/3 (Id=2/3/4, branch).
// Consumed by: LocationsController.GetAll(), and referenced as a
// foreign key from nearly every other table in the schema.
// ============================================================
namespace PharmacyAPI.Models
{
    public class Location
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string? Address { get; set; }
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;
    }
}