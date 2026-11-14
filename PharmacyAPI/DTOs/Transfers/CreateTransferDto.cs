// ============================================================
// CreateTransferDto.cs
// ------------------------------------------------------------
// Purpose: Request shape for POST /api/transfers/request.
//
// Structure: ProductId, FromLocationId, ToLocationId, BatchId,
// Quantity (all ints). No RequestedByUserId field — that is read
// server-side from the caller's own JWT claim (see
// TransfersController.RequestTransfer), never trusted from the
// request body, closing the gap where someone could submit a
// request "as" a different user.
//
// Architecture note (consistency pass): this DTO previously carried
// a RequestedByUserId field and sat unused while TransfersController
// bound to its own inline TransferRequestBody class instead — which
// had already dropped that field as part of an earlier security fix.
// This file has been corrected to match that fix and is the one
// TransfersController.RequestTransfer actually binds to. Same
// accepted JSON shape as before, no behavior change.
//
// Consumed by: TransfersController.RequestTransfer([FromBody] CreateTransferDto request).
// Sent by: transfers.js via api.transfers.request(payload).
// ============================================================
namespace PharmacyAPI.DTOs.Transfers
{
    public class CreateTransferDto
    {
        public int ProductId { get; set; }
        public int FromLocationId { get; set; }
        public int ToLocationId { get; set; }
        public int BatchId { get; set; }
        public int Quantity { get; set; }
    }
}
