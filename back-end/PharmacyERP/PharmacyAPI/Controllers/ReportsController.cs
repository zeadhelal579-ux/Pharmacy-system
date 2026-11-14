// ============================================================
// ReportsController.cs
// ------------------------------------------------------------
// Purpose: Two read reports (expiring batches, shortage alerts)
// plus a manual trigger to re-scan and generate new shortage alerts.
//
// Structure:
//   1. [Authorize] on the class — any logged-in user can call these.
//   2. Constructor (top) — injects ReportService.
//   3. GET expiring?days=90 — batches expiring within N days
//      (default 90 if not specified).
//   4. GET shortages — all unresolved ShortageAlert rows.
//   5. POST check-shortages — manually re-runs the same scan that
//      LowStockCheckerJob runs automatically once a day. Useful for
//      testing or forcing an immediate refresh from the UI.
//
// Consumed by: dashboard.js (expiring, shortages), reports.js
// (expiring, shortages, check-shortages), print-report.html
// (expiring, shortages).
// ============================================================
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyAPI.Services;

namespace PharmacyAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ReportsController : ControllerBase
    {
        private readonly ReportService _reportService;

        public ReportsController(ReportService reportService)
        {
            _reportService = reportService;
        }

        [HttpGet("expiring")]
        public async Task<IActionResult> GetExpiringBatches([FromQuery] int days = 90)
        {
            if (days is < 0 or > 365) return BadRequest();
            var batches = await _reportService.GetExpiringBatchesAsync(days, User.Scope());
            return Ok(batches);
        }

        [HttpGet("shortages")]
        public async Task<IActionResult> GetShortageAlerts()
        {
            var alerts = await _reportService.GetShortageAlertsAsync(User.Scope());
            return Ok(alerts);
        }

        [Authorize(Roles = "SuperAdmin")]
        [HttpPost("check-shortages")]
        public async Task<IActionResult> CheckShortages()
        {
            await _reportService.CheckAndCreateShortageAlertsAsync();
            return Ok(new { message = "Shortage check completed" });
        }
    }
}
