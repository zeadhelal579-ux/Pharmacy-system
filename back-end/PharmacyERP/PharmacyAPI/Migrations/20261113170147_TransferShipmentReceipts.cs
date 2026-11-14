using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmacyAPI.Migrations
{
    /// <inheritdoc />
    public partial class TransferShipmentReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TransferReceipts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TransferRequestId = table.Column<int>(type: "int", nullable: false),
                    MovementId = table.Column<int>(type: "int", nullable: false),
                    OperationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Accepted = table.Column<int>(type: "int", nullable: false),
                    Damaged = table.Column<int>(type: "int", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TransferReceipts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TransferReceipts_InventoryTransactions_MovementId",
                        column: x => x.MovementId,
                        principalTable: "InventoryTransactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TransferReceipts_TransferRequests_TransferRequestId",
                        column: x => x.TransferRequestId,
                        principalTable: "TransferRequests",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_TransferReceipts_MovementId",
                table: "TransferReceipts",
                column: "MovementId");

            migrationBuilder.CreateIndex(
                name: "IX_TransferReceipts_TransferRequestId_OperationId",
                table: "TransferReceipts",
                columns: new[] { "TransferRequestId", "OperationId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TransferReceipts");
        }
    }
}
