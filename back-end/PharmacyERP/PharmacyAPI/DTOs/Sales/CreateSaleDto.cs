// ============================================================
// CreateSaleDto.cs
// ------------------------------------------------------------
// Purpose: Request shape for POST /api/sales (checkout).
//
// Structure:
//   - CreateSaleDto: Items (list of SaleItemDto). No LocationId or
//     UserId field — those are read server-side from the caller's
//     own JWT claims (see SalesController.CreateSale), never trusted
//     from the request body.
//   - SaleItemDto: ProductId, BatchId, Quantity (ints), UnitPrice
//     (decimal).
//
// Architecture note (consistency pass): this DTO previously carried
// LocationId/UserId fields and sat unused while SalesController bound
// to its own inline CreateSaleRequest/SaleItemRequest classes instead
// — which had already dropped those two fields as part of an earlier
// security fix. This file has been corrected to match that fix (the
// two now-unused fields removed) and is the one SalesController.CreateSale
// actually binds to. Same accepted JSON shape as before, no behavior change.
//
// Consumed by: SalesController.CreateSale([FromBody] CreateSaleDto request).
// Sent by: pos.js via api.sales.create(payload).
// ============================================================
using System.ComponentModel.DataAnnotations;

namespace PharmacyAPI.DTOs.Sales
{
    public class CreateSaleDto
    {
        [Required, MinLength(1), MaxLength(200)]
        public List<SaleItemDto> Items { get; set; } = new();
        [RegularExpression("^(Cash|Card)$")]
        public string? PaymentMethod { get; set; }
        [Range(1, int.MaxValue)]
        public int? ShiftId { get; set; }
        [Range(typeof(decimal), "0", "1000000")]
        public decimal DiscountAmount { get; set; }
        [MaxLength(500)]
        public string? DiscountReason { get; set; }
        [Range(1, int.MaxValue)]
        public int? DiscountApprovalId { get; set; }
    }

    public class SaleItemDto
    {
        [Range(1, int.MaxValue)]
        public int ProductId { get; set; }
        public int BatchId { get; set; }
        public bool IsPack { get; set; }
        [Range(1, 100000)]
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
    }
}
