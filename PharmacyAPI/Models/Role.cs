// ============================================================
// Role.cs
// ------------------------------------------------------------
// Purpose: EF Core entity representing a permission level —
// SuperAdmin, BranchManager, Cashier, or WarehouseAdmin.
//
// Structure:
//   - Scalar fields: Id, Name, IsDeleted, CreatedAt, UpdatedAt.
//   - Navigation property: Users — a collection of every User
//     assigned this role, defaults to non-null empty List<User>().
//
// Maps to: the Roles table in SQL Server.
// Seed data: 4 rows — SuperAdmin (Id=1), BranchManager (Id=2),
// Cashier (Id=3), WarehouseAdmin (Id=4). No CRUD endpoint exists
// for Roles — they are fixed, seeded once, and referenced by Id
// everywhere (User.RoleId, and hardcoded in users.js's ROLE_NAMES
// map and the <select> options in users.html).
// ============================================================
namespace PharmacyAPI.Models
{
    public class Role
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;

        public ICollection<User> Users { get; set; } = new List<User>();
    }
}