// ============================================================
// ExpiryReportDto.cs
// ------------------------------------------------------------
// Purpose: Intended flattened response shape for the expiring-
// batches report, combining data from Batch + its Product +
// Location navigation properties into one flat object.
//
// Structure: BatchId, ProductName, LocationName, BatchNumber,
// ExpiryDate, Quantity, DaysRemaining.
//
// STATUS: currently unused. ReportsController.GetExpiringBatches
// returns the raw Batch entities directly (with Product/Location
// included via EF's .Include()), not this flattened DTO. The
// frontend (dashboard.js, reports.js, print-report.html) reads
// batch.product.name and batch.location.name directly from the
// nested navigation objects instead. Matches the
// MappingProfile.CreateMap<Batch, ExpiryReportDto>() rule, kept
// as scaffolding in case the API response is flattened later.
// ============================================================
namespace PharmacyAPI.DTOs.Reports
{
    public class ExpiryReportDto
    {
        public int BatchId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string LocationName { get; set; } = string.Empty;
        public string? BatchNumber { get; set; }
        public DateTime ExpiryDate { get; set; }
        public int Quantity { get; set; }
        public int DaysRemaining { get; set; }
    }
}