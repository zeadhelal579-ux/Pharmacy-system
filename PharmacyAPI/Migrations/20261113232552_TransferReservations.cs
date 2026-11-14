using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmacyAPI.Migrations
{
    /// <inheritdoc />
    public partial class TransferReservations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ReservedQuantity",
                table: "Batches",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "TransferReservations",
                columns: table => new
                {
                    TransferRequestId = table.Column<int>(type: "int", nullable: false),
                    BatchId = table.Column<int>(type: "int", nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TransferReservations", x => new { x.TransferRequestId, x.BatchId });
                    table.ForeignKey(
                        name: "FK_TransferReservations_Batches_BatchId",
                        column: x => x.BatchId,
                        principalTable: "Batches",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TransferReservations_TransferRequests_TransferRequestId",
                        column: x => x.TransferRequestId,
                        principalTable: "TransferRequests",
                        principalColumn: "Id");
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Batches_ReservedQuantity",
                table: "Batches",
                sql: "[ReservedQuantity] >= 0 AND [Quantity] >= [ReservedQuantity]");

            migrationBuilder.CreateIndex(
                name: "IX_TransferReservations_BatchId",
                table: "TransferReservations",
                column: "BatchId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TransferReservations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Batches_ReservedQuantity",
                table: "Batches");

            migrationBuilder.DropColumn(
                name: "ReservedQuantity",
                table: "Batches");
        }
    }
}
