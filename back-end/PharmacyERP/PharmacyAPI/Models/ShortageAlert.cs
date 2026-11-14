// ============================================================
// ShortageAlert.cs
// ------------------------------------------------------------
// Purpose: EF Core entity representing a "low stock" warning for
// one specific product at one specific location.
//
// Structure:
//   - Scalar fields: Id, ProductId, LocationId, CurrentQuantity
//     (snapshot of the stock level at the moment the alert was
//     created — not live/recalculated), MinStock (snapshot of the
//     product's threshold at that moment), IsResolved, IsDeleted,
//     CreatedAt, UpdatedAt.
//   - Navigation properties: Product, Location (both required).
//
// Maps to: the ShortageAlerts table in SQL Server.
// Written by: ReportService.CheckAndCreateShortageAlertsAsync —
// runs a product × location scan (triggered daily by
// LowStockCheckerJob, or manually via POST /reports/check-shortages)
// and inserts one row per product/location combo that's at or
// below MinStock, but only if an unresolved alert for that same
// combo doesn't already exist (prevents duplicate alerts piling up).
// Consumed by: ReportsController.GetShortageAlerts(), rendered in
// dashboard.js and reports.js.
//
// NOTE: nothing in the current codebase ever sets IsResolved = true
// — once an alert is created, there is no endpoint to resolve/dismiss
// it. This means CheckAndCreateShortageAlertsAsync's duplicate-check
// will correctly avoid re-inserting it, but the alert will persist
// forever even after the stock is restocked. Worth a "resolve"
// endpoint later if this becomes a real workflow issue.
// ============================================================
namespace PharmacyAPI.Models
{
    public class ShortageAlert
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public int LocationId { get; set; }
        public int CurrentQuantity { get; set; }
        public int MinStock { get; set; }
        public bool IsResolved { get; set; } = false;
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;

        public Product Product { get; set; } = null!;
        public Location Location { get; set; } = null!;
    }
}