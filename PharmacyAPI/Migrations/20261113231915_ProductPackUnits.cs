using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmacyAPI.Migrations
{
    /// <inheritdoc />
    public partial class ProductPackUnits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "Amount",
                table: "SaleItems",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LineNumber",
                table: "SaleItems",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SoldUnit",
                table: "SaleItems",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "UnitsPerPack",
                table: "SaleItems",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PackBarcode",
                table: "Products",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PackName",
                table: "Products",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PackPrice",
                table: "Products",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PackSize",
                table: "Products",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Amount",
                table: "SaleItems");

            migrationBuilder.DropColumn(
                name: "LineNumber",
                table: "SaleItems");

            migrationBuilder.DropColumn(
                name: "SoldUnit",
                table: "SaleItems");

            migrationBuilder.DropColumn(
                name: "UnitsPerPack",
                table: "SaleItems");

            migrationBuilder.DropColumn(
                name: "PackBarcode",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "PackName",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "PackPrice",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "PackSize",
                table: "Products");
        }
    }
}
