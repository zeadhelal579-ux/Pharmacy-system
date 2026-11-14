// ============================================================
// ProductsController.cs
// ------------------------------------------------------------
// Purpose: Full CRUD for the Products table (medicines catalog).
//
// Structure:
//   1. [Authorize] on the class — any logged-in user can call
//      GET endpoints (read access stays open to everyone who's
//      logged in, since Cashiers/WarehouseAdmin need to see
//      products to sell/stock them).
//   2. [Authorize(Roles = "SuperAdmin,BranchManager")] on Create,
//      Update, Delete specifically — matches the agreed permission
//      matrix: BranchManager can add/edit/delete products (e.g. to
//      register a returned item), Cashier and WarehouseAdmin cannot.
//   3. Constructor (top) — injects IProductRepository.
//   4. GET / — all non-deleted products.
//   5. GET {id} — single product by Id.
//   6. GET barcode/{barcode} — single product by barcode.
//   7. POST / — create. Binds directly to the raw Product EF model
//      (safe — Product has no required single-reference nav
//      properties, only a Batches collection defaulting to an
//      empty list).
//   8. PUT {id} — update.
//   9. DELETE {id} — soft delete only.
//
// Consumed by: products.js (full CRUD), pos.js/inventory.js
// (read-only, via Batch.Product navigation data).
// ============================================================
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PharmacyAPI.Models;
using PharmacyAPI.Repositories;
using System.ComponentModel.DataAnnotations;

namespace PharmacyAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ProductsController : ControllerBase
    {
        private readonly IProductRepository _productRepository;

        public ProductsController(IProductRepository productRepository)
        {
            _productRepository = productRepository;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var products = await _productRepository.GetAllAsync();
            return Ok(products);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var product = await _productRepository.GetByIdAsync(id);
            if (product == null) return NotFound();
            return Ok(product);
        }

        [HttpGet("barcode/{barcode}")]
        public async Task<IActionResult> GetByBarcode(string barcode)
        {
            var product = await _productRepository.GetByBarcodeAsync(barcode);
            if (product == null) return NotFound();
            return Ok(product);
        }

        [Authorize(Roles = "SuperAdmin,BranchManager")]
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CatalogInput input)
        {
            var product = new Product();
            if (!await ApplyAsync(product, input)) return Conflict(new { message = "Invalid product or duplicate barcode" });
            await _productRepository.AddAsync(product);
            return CreatedAtAction(nameof(GetById), new { id = product.Id }, product);
        }

        [Authorize(Roles = "SuperAdmin,BranchManager")]
        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] CatalogInput input)
        {
            var product = await _productRepository.GetByIdAsync(id);
            if (product is null) return NotFound();
            if (!await ApplyAsync(product, input)) return Conflict(new { message = "Invalid product or duplicate barcode" });
            await _productRepository.UpdateAsync(product);
            return NoContent();
        }

        [Authorize(Roles = "SuperAdmin,BranchManager")]
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            await _productRepository.DeleteAsync(id);
            return NoContent();
        }

        private async Task<bool> ApplyAsync(Product product, CatalogInput input)
        {
            var barcode = input.Barcode?.Trim();
            var packBarcode = input.PackBarcode?.Trim();
            var hasPack = input.PackSize.HasValue;
            if (string.IsNullOrWhiteSpace(input.Name) || decimal.Round(input.SellPrice, 2) != input.SellPrice ||
                decimal.Round(input.BuyPrice, 2) != input.BuyPrice) return false;
            if (hasPack != (input.PackPrice.HasValue && !string.IsNullOrWhiteSpace(packBarcode) &&
                    !string.IsNullOrWhiteSpace(input.PackName)) ||
                (!hasPack && (input.PackPrice.HasValue || !string.IsNullOrEmpty(packBarcode) || !string.IsNullOrWhiteSpace(input.PackName))) ||
                (input.PackPrice is decimal packPrice && decimal.Round(packPrice, 2) != packPrice) ||
                (!string.IsNullOrEmpty(packBarcode) && string.Equals(barcode, packBarcode, StringComparison.OrdinalIgnoreCase)))
                return false;
            if (!string.IsNullOrEmpty(barcode) && await _productRepository.GetByBarcodeAsync(barcode) is { } existing &&
                existing.Id != product.Id) return false;
            if (!string.IsNullOrEmpty(packBarcode) && await _productRepository.GetByBarcodeAsync(packBarcode) is { } pack &&
                pack.Id != product.Id) return false;
            product.Name = input.Name.Trim();
            product.Barcode = string.IsNullOrEmpty(barcode) ? null : barcode;
            product.Category = input.Category?.Trim();
            product.Unit = input.Unit?.Trim();
            product.SellPrice = input.SellPrice;
            product.BuyPrice = input.BuyPrice;
            product.MinStock = input.MinStock;
            product.PackName = input.PackName?.Trim();
            product.PackBarcode = string.IsNullOrEmpty(packBarcode) ? null : packBarcode;
            product.PackSize = input.PackSize;
            product.PackPrice = input.PackPrice;
            return true;
        }
    }
}

public sealed record CatalogInput([Required, MaxLength(150)] string Name,
    [MaxLength(80)] string? Barcode, [MaxLength(100)] string? Category, [MaxLength(80)] string? Unit,
    [Range(typeof(decimal), "0", "1000000")] decimal SellPrice,
    [Range(typeof(decimal), "0", "1000000")] decimal BuyPrice,
    [Range(0, 1000000)] int MinStock = 10,
    [MaxLength(80)] string? PackName = null, [MaxLength(80)] string? PackBarcode = null,
    [Range(2, 1000)] int? PackSize = null,
    [Range(typeof(decimal), "0", "1000000")] decimal? PackPrice = null);
