// ============================================================
// LowStockCheckerJob.cs
// ------------------------------------------------------------
// Purpose: A Hangfire recurring background job that scans every
// product across every location and creates a ShortageAlert row
// whenever stock falls at or below the product's MinStock threshold.
//
// Structure:
//   1. Constructor (top) — injects ReportService via DI (Scoped lifetime,
//      registered in Program.cs).
//   2. [AutomaticRetry(Attempts = 3)] — same retry policy as
//      ExpiryCheckerJob: up to 3 automatic retries on failure.
//   3. CheckLowStockAsync() — the actual job body. Delegates entirely
//      to ReportService.CheckAndCreateShortageAlertsAsync(), which does
//      the real product × location scan and DB writes.
//
// Scheduling: registered in Program.cs as a daily recurring job:
//   RecurringJob.AddOrUpdate<LowStockCheckerJob>("lowstock-checker",
//       job => job.CheckLowStockAsync(), Cron.Daily);
//
// Dependency note: the actual shortage-detection logic (including the
// "avoid duplicate alerts" check) lives in ReportService, not here —
// this class is just the Hangfire-facing entry point that triggers it
// once a day.
// ============================================================
using Hangfire;
using PharmacyAPI.Services;

namespace PharmacyAPI.BackgroundJobs
{
    public class LowStockCheckerJob
    {
        private readonly ReportService _reportService;

        public LowStockCheckerJob(ReportService reportService)
        {
            _reportService = reportService;
        }

        [AutomaticRetry(Attempts = 3)]
        public async Task CheckLowStockAsync()
        {
            await _reportService.CheckAndCreateShortageAlertsAsync();
        }
    }
}