// ============================================================
// ExpiryCheckerJob.cs
// ------------------------------------------------------------
// Purpose: A Hangfire recurring background job that checks for
// product batches approaching their expiry date.
//
// Structure:
//   1. Constructor (top) — injects ReportService via DI (Scoped lifetime,
//      registered in Program.cs).
//   2. [AutomaticRetry(Attempts = 3)] — Hangfire attribute: if the job
//      throws an exception, Hangfire will automatically retry it up to
//      3 times before marking it as permanently failed.
//   3. CheckExpiringBatchesAsync() — the actual job body. Calls
//      ReportService.GetExpiringBatchesAsync(90) to fetch all batches
//      expiring within 90 days.
//
// Scheduling: this job is NOT scheduled inside this file. It is
// registered as a recurring job in Program.cs via:
//   RecurringJob.AddOrUpdate<ExpiryCheckerJob>("expiry-checker",
//       job => job.CheckExpiringBatchesAsync(), Cron.Daily);
// which runs it once every day automatically via the Hangfire server.
//
// Note: currently this job only *fetches* the expiring batches list
// but does nothing with the result (no email, no notification, no log).
// The actual value today is that it primes/exercises the query daily;
// if a notification feature is added later, this is where it would hook in.
// ============================================================

using Hangfire;
using PharmacyAPI.Services;

namespace PharmacyAPI.BackgroundJobs
{
    public class ExpiryCheckerJob
    {
        private readonly ReportService _reportService;

        public ExpiryCheckerJob(ReportService reportService)
        {
            _reportService = reportService;
        }

        [AutomaticRetry(Attempts = 3)]
        public async Task CheckExpiringBatchesAsync()
        {
            await _reportService.GetExpiringBatchesAsync(90);
        }
    }
}