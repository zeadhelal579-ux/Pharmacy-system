// Validates and commits an opening stock import as one database transaction.
using System.ComponentModel.DataAnnotations;
using System.Data;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Data;
using PharmacyAPI.Models;

namespace PharmacyAPI.Controllers;

[ApiController, Route("api/opening-stock"), Authorize(Roles = "SuperAdmin,BranchManager")]
public sealed class OpeningStockController(AppDbContext context, TimeProvider clock) : ControllerBase
{
    [HttpPost("preview")]
    public Task<IActionResult> Preview(OpeningInput input, CancellationToken token) => ProcessAsync(input, false, token);

    [HttpPost("apply")]
    public Task<IActionResult> Apply(OpeningInput input, CancellationToken token) => ProcessAsync(input, true, token);

    private async Task<IActionResult> ProcessAsync(OpeningInput input, bool apply, CancellationToken token)
    {
        if (!User.CanAccess(input.LocationId)) return Forbid();
        var fingerprint = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(input.Rows)));
        await using var transaction = apply
            ? await context.Database.BeginTransactionAsync(IsolationLevel.Serializable, token) : null;
        try
        {
            if (!await context.Locations.AnyAsync(item => item.Id == input.LocationId && !item.IsDeleted, token))
                return NotFound();
            var previous = await context.OpeningImports.AsNoTracking().SingleOrDefaultAsync(item =>
                item.LocationId == input.LocationId && item.Fingerprint == fingerprint, token);
            if (previous is not null) return Ok(new ImportReview([], previous.RowCount, true));

            var barcodes = input.Rows.Where(row => !string.IsNullOrWhiteSpace(row?.Barcode))
                .Select(row => row.Barcode.Trim()).Distinct().ToArray();
            var products = (await context.Products.Where(item => !item.IsDeleted && item.Barcode != null &&
                barcodes.Contains(item.Barcode)).ToListAsync(token)).ToLookup(item => item.Barcode!, StringComparer.OrdinalIgnoreCase);
            var existingIds = products.SelectMany(group => group.Select(item => item.Id)).ToArray();
            var packBarcodes = (await context.Products.Where(item => !item.IsDeleted && item.PackBarcode != null &&
                barcodes.Contains(item.PackBarcode)).Select(item => item.PackBarcode!).ToListAsync(token))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var lots = await context.Batches.AsNoTracking().Where(item =>
                item.LocationId == input.LocationId && !item.IsDeleted && existingIds.Contains(item.ProductId))
                .Select(item => new { item.ProductId, item.BatchNumber, item.ExpiryDate }).ToListAsync(token);

            var errors = new List<ImportIssue>();
            var seen = new HashSet<(string Barcode, string Lot, DateOnly Expiry)>();
            var definitions = new Dictionary<string, (string Name, decimal Price)>(StringComparer.OrdinalIgnoreCase);
            for (var index = 0; index < input.Rows.Length; index++)
            {
                var row = input.Rows[index];
                if (row is null || string.IsNullOrWhiteSpace(row.Name) || string.IsNullOrWhiteSpace(row.Barcode) ||
                    string.IsNullOrWhiteSpace(row.BatchNumber) || row.ExpiryDate is null ||
                    decimal.Round(row.SellPrice, 2) != row.SellPrice)
                {
                    errors.Add(new ImportIssue(index + 1, "Required value missing or price invalid"));
                    continue;
                }

                var barcode = row.Barcode.Trim();
                if (packBarcodes.Contains(barcode))
                    errors.Add(new ImportIssue(index + 1, "Barcode belongs to a package; import stock in base units"));
                var batchNumber = row.BatchNumber.Trim();
                var product = products[barcode].ToArray();
                var expiry = row.ExpiryDate.Value;
                if (!seen.Add((barcode.ToUpperInvariant(), batchNumber.ToUpperInvariant(), expiry)))
                    errors.Add(new ImportIssue(index + 1, "Duplicate lot in this import"));
                if (product.Length > 1 || (product.Length == 1 &&
                    (product[0].Name != row.Name.Trim() || product[0].SellPrice != row.SellPrice)))
                    errors.Add(new ImportIssue(index + 1, "Barcode conflicts with an existing product"));
                if (definitions.TryGetValue(barcode, out var definition) && definition != (row.Name.Trim(), row.SellPrice))
                    errors.Add(new ImportIssue(index + 1, "Product details disagree for this barcode"));
                definitions.TryAdd(barcode, (row.Name.Trim(), row.SellPrice));
                if (product.Length == 1 && lots.Any(lot => lot.ProductId == product[0].Id &&
                    string.Equals(lot.BatchNumber, batchNumber, StringComparison.OrdinalIgnoreCase) &&
                    DateOnly.FromDateTime(lot.ExpiryDate) == expiry))
                    errors.Add(new ImportIssue(index + 1, "Lot already recorded at this location"));
            }

            var review = new ImportReview(errors, input.Rows.Length, false);
            if (!apply) return Ok(review);
            if (errors.Count > 0) return UnprocessableEntity(review);
            var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var newProducts = new Dictionary<string, Product>(StringComparer.OrdinalIgnoreCase);
            var today = DateOnly.FromDateTime(clock.GetLocalNow().Date);
            foreach (var row in input.Rows)
            {
                var barcode = row.Barcode.Trim();
                var product = products[barcode].SingleOrDefault();
                if (product is null && !newProducts.TryGetValue(barcode, out product))
                {
                    product = new Product { Name = row.Name.Trim(), Barcode = barcode, SellPrice = row.SellPrice };
                    newProducts.Add(barcode, product);
                }

                var expiry = row.ExpiryDate!.Value;
                context.InventoryTransactions.Add(new InventoryTransaction
                {
                    Product = product!, ToLocationId = input.LocationId, Quantity = row.Quantity,
                    Type = "OpeningStock", UserId = userId,
                    Batch = new Batch
                    {
                        Product = product!, LocationId = input.LocationId, Quantity = row.Quantity,
                        BatchNumber = row.BatchNumber.Trim(), ExpiryDate = expiry.ToDateTime(TimeOnly.MinValue),
                        IsQuarantined = expiry < today
                    }
                });
            }

            context.OpeningImports.Add(new OpeningImport
            {
                LocationId = input.LocationId, Fingerprint = fingerprint, RowCount = input.Rows.Length
            });
            await context.SaveChangesAsync(token);
            await transaction!.CommitAsync(token);
            return Ok(review);
        }
        catch (Exception error) when (error is SqlException { Number: 1205 } ||
            error is DbUpdateException { InnerException: SqlException { Number: 1205 or 2601 or 2627 } })
        {
            return Conflict(new { message = "Inventory changed during import. Retry the same import." });
        }
    }
}

public sealed record OpeningInput([Range(1, int.MaxValue)] int LocationId,
    [Required, MinLength(1), MaxLength(500)] OpeningRow[] Rows);
public sealed record OpeningRow([MaxLength(150)] string Name, [MaxLength(80)] string Barcode,
    [MaxLength(80)] string BatchNumber, DateOnly? ExpiryDate,
    [Range(1, 1000000)] int Quantity, [Range(typeof(decimal), "0", "1000000")] decimal SellPrice);
public sealed record ImportReview(List<ImportIssue> Errors, int RowCount, bool AlreadyApplied);
public sealed record ImportIssue(int Row, string Message);
