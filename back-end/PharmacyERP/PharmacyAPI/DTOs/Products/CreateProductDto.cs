// ============================================================
// CreateProductDto.cs
// ------------------------------------------------------------
// Purpose: Intended request shape for creating a new Product.
//
// Structure: Name, Barcode, Category, Unit (strings, some nullable),
// MinStock (int, defaults to 10), SellPrice, BuyPrice (decimals).
//
// STATUS: currently unused. ProductsController.Create binds
// directly to the raw Product EF model instead of this DTO — this
// works fine because Product has no required single-reference
// navigation properties (see the note left on ProductsController.cs
// earlier in this review). Kept as scaffolding matching the
// MappingProfile.CreateMap<CreateProductDto, Product>() rule, in
// case the controller is refactored later to use it.
// ============================================================
namespace PharmacyAPI.DTOs.Products
{
    public class CreateProductDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Barcode { get; set; }
        public string? Category { get; set; }
        public string? Unit { get; set; }
        public int MinStock { get; set; } = 10;
        public decimal SellPrice { get; set; }
        public decimal BuyPrice { get; set; }
    }
}