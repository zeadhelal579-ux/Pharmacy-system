// ============================================================
// Supplier.cs
// ------------------------------------------------------------
// Purpose: EF Core entity representing a medicine supplier/vendor.
//
// Structure:
//   - Scalar fields: Id, Name, Contact (nullable), Notes (nullable),
//     IsDeleted, CreatedAt, UpdatedAt.
//   - No navigation properties in either direction.
//
// Maps to: the Suppliers table in SQL Server.
// STATUS: fully scaffolded at the database and model level, but
// completely unused above that — no SuppliersController exists,
// no Service references it, no frontend page manages suppliers.
// This was originally a "nice to have" item in the project plan
// (Phase 1, tagged "nice" not "must"), not yet built out.
// ============================================================
namespace PharmacyAPI.Models
{
    public class Supplier
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Contact { get; set; }
        public string? Notes { get; set; }
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;
    }
}