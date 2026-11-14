// ============================================================
// AppDbContext.cs
// ------------------------------------------------------------
// Purpose: The single Entity Framework Core DbContext for the
// entire application — the bridge between the C# Models and the
// PharmacyERP database in SQL Server LocalDB.
//
// Structure:
//   1. Constructor (top) — takes DbContextOptions<AppDbContext>,
//      configured in Program.cs via AddDbContext + UseSqlServer,
//      reading the connection string from appsettings.json
//      ("ConnectionStrings:DefaultConnection").
//   2. DbSet<T> properties (one per table) — each one maps a Model
//      class directly to its matching SQL Server table:
//      Locations, Roles, Users, Products, Batches, Sales, SaleItems,
//      TransferRequests, InventoryTransactions, Suppliers, ShortageAlerts.
//
// Note: there is no OnModelCreating override here — all foreign
// key relationships are inferred automatically by EF Core from the
// navigation properties declared on each Model class (e.g. User.Role,
// Batch.Product, Batch.Location). This works correctly but produces
// the decimal-precision warnings seen at startup (Cost, BuyPrice,
// SellPrice, TotalAmount, UnitPrice all default to decimal(18,2)
// without an explicit HasPrecision() call) — harmless at this scale,
// but worth tightening later with an OnModelCreating override if
// exact currency precision ever matters.
//
// Consumed by: every Repository and Service class in the project,
// and directly by some Controllers (Dashboard, Locations, Users,
// Transfers) that skip the repository layer for simple reads.
// ============================================================
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Models;

namespace PharmacyAPI.Data
{
    public class AppDbContext : DbContext
    {
        private readonly IHttpContextAccessor? _http;

        public AppDbContext(DbContextOptions<AppDbContext> options, IHttpContextAccessor? http = null)
            : base(options) => _http = http;

        public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
        {
            if (_http?.HttpContext?.User is { } actor)
                AuditEvents.AddRange(OperationalAudit.Capture(ChangeTracker, actor).ToArray());
            return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            var discount = modelBuilder.Entity<DiscountApproval>();
            discount.Property(item => item.Amount).HasPrecision(18, 2);
            discount.Property(item => item.Cart).HasMaxLength(64);
            discount.Property(item => item.Reason).HasMaxLength(500);
            discount.Property<byte[]>("Version").IsRowVersion();
            discount.HasIndex(item => new { item.LocationId, item.Id });
            modelBuilder.Entity<Sale>().Property(item => item.DiscountAmount).HasPrecision(18, 2);
            var audit = modelBuilder.Entity<AuditEvent>();
            audit.Property(item => item.Entity).HasMaxLength(80);
            audit.Property(item => item.Action).HasMaxLength(16);
            audit.Property(item => item.Reason).HasMaxLength(500);
            audit.HasIndex(item => new { item.LocationId, item.Id });
            modelBuilder.Entity<TransferReservation>().HasKey(item => new { item.TransferRequestId, item.BatchId });
            modelBuilder.Entity<TransferReservation>().HasOne<TransferRequest>().WithMany()
                .HasForeignKey(item => item.TransferRequestId).OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<Batch>().ToTable(table => table.HasCheckConstraint(
                "CK_Batches_ReservedQuantity", "[ReservedQuantity] >= 0 AND [Quantity] >= [ReservedQuantity]"));
            modelBuilder.Entity<ReorderRule>().HasKey(item => new { item.ProductId, item.LocationId });
            var recall = modelBuilder.Entity<LotRecall>();
            recall.Property(item => item.Lot).HasMaxLength(80);
            recall.Property(item => item.Reason).HasMaxLength(500);
            recall.Property(item => item.CloseReason).HasMaxLength(500);
            recall.HasIndex(item => new { item.ProductId, item.Lot }).IsUnique().HasFilter("[ClosedAt] IS NULL");
            modelBuilder.Entity<BatchStatusChange>().Property(item => item.Reason).HasMaxLength(500);
            modelBuilder.Entity<OpeningImport>().Property(item => item.Fingerprint).HasMaxLength(64);
            modelBuilder.Entity<OpeningImport>().HasIndex(item => new { item.LocationId, item.Fingerprint }).IsUnique();
            modelBuilder.Entity<Batch>().Property<byte[]>("Version").IsRowVersion();
            modelBuilder.Entity<TransferRequest>().Property<byte[]>("Version").IsRowVersion();
            modelBuilder.Entity<Batch>()
                .HasIndex(batch => new { batch.LocationId, batch.ProductId, batch.ExpiryDate });
            modelBuilder.Entity<TransferRequest>().HasOne(transfer => transfer.FromLocation)
                .WithMany().OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<TransferRequest>().HasOne(transfer => transfer.ToLocation)
                .WithMany().OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<TransferRequest>().HasOne(transfer => transfer.RequestedByUser)
                .WithMany().OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<TransferRequest>().HasOne(transfer => transfer.ApprovedByUser)
                .WithMany().OnDelete(DeleteBehavior.NoAction);
            foreach (var foreignKey in modelBuilder.Model.GetEntityTypes()
                .SelectMany(entity => entity.GetForeignKeys()))
            {
                foreignKey.DeleteBehavior = DeleteBehavior.NoAction;
            }

            modelBuilder.Entity<Product>().Property(product => product.BuyPrice).HasPrecision(18, 2);
            modelBuilder.Entity<Product>().Property(product => product.SellPrice).HasPrecision(18, 2);
            modelBuilder.Entity<Product>().Property(product => product.PackPrice).HasPrecision(18, 2);
            modelBuilder.Entity<Product>().Property(product => product.PackName).HasMaxLength(80);
            modelBuilder.Entity<Product>().Property(product => product.PackBarcode).HasMaxLength(80);
            modelBuilder.Entity<Batch>().Property(batch => batch.Cost).HasPrecision(18, 2);
            modelBuilder.Entity<Sale>().Property(sale => sale.TotalAmount).HasPrecision(18, 2);
            modelBuilder.Entity<SaleItem>().Property(item => item.UnitPrice).HasPrecision(18, 2);
            modelBuilder.Entity<SaleItem>().Property(item => item.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<SaleItem>().Property(item => item.SoldUnit).HasMaxLength(80);
            modelBuilder.Entity<Sale>().Property(sale => sale.RequestFingerprint).HasMaxLength(64);
            modelBuilder.Entity<Sale>().Property(sale => sale.PaymentMethod).HasMaxLength(8);
            modelBuilder.Entity<Sale>().HasIndex(sale => new { sale.UserId, sale.OperationId }).IsUnique();
            var shift = modelBuilder.Entity<CashShift>();
            shift.Property(item => item.Revision).IsConcurrencyToken();
            shift.Property(item => item.OpeningCash).HasPrecision(18, 2);
            shift.Property(item => item.ActualCash).HasPrecision(18, 2);
            shift.Property(item => item.ExpectedCash).HasPrecision(18, 2);
            shift.Property(item => item.CloseNote).HasMaxLength(500);
            shift.HasIndex(item => item.UserId).IsUnique().HasFilter("[ClosedAt] IS NULL");
            var movement = modelBuilder.Entity<ShiftMovement>();
            movement.Property(item => item.Amount).HasPrecision(18, 2);
            movement.Property(item => item.Kind).HasMaxLength(12);
            movement.Property(item => item.Reason).HasMaxLength(500);
            movement.HasIndex(item => new { item.ShiftId, item.OperationId }).IsUnique();
            movement.HasOne(item => item.Shift).WithMany().OnDelete(DeleteBehavior.NoAction);
            movement.HasOne(item => item.SaleItem).WithMany().OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<SaleItem>().Property<int>("ReturnedQuantity").IsConcurrencyToken();
            modelBuilder.Entity<PurchaseOrder>().HasMany(order => order.Lines).WithOne()
                .HasForeignKey("PurchaseOrderId").IsRequired().OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<PurchaseLine>().Property(line => line.Received).IsConcurrencyToken();
            modelBuilder.Entity<PurchaseOrder>().Property(order => order.ApprovedAt).IsConcurrencyToken();
            modelBuilder.Entity<PurchaseLine>().Property(line => line.UnitCost).HasPrecision(18, 2);
            modelBuilder.Entity<PurchaseReceipt>().Property(receipt => receipt.UnitCost).HasPrecision(18, 2);
            modelBuilder.Entity<PurchaseReceipt>().Property(receipt => receipt.InvoiceNumber).HasMaxLength(80);
            modelBuilder.Entity<PurchaseReceipt>().HasIndex(receipt => receipt.OperationId).IsUnique();
            modelBuilder.Entity<SupplierReturn>().Property(item => item.Reason).HasMaxLength(500);
            modelBuilder.Entity<SupplierReturn>().HasIndex(item => new { item.PurchaseReceiptId, item.OperationId }).IsUnique();
            modelBuilder.Entity<SupplierReturn>().HasOne(item => item.PurchaseReceipt).WithMany().OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<TransferReceipt>().Property(receipt => receipt.Note).HasMaxLength(500);
            var count = modelBuilder.Entity<StockCount>();
            count.Property(item => item.Reason).HasMaxLength(500);
            count.Property(item => item.ApprovedAt).IsConcurrencyToken();
            count.HasIndex(item => item.BatchId).IsUnique().HasFilter("[ApprovedAt] IS NULL");
            modelBuilder.Entity<TransferReceipt>().HasIndex(receipt => new { receipt.TransferRequestId, receipt.OperationId }).IsUnique();
        }

        public DbSet<Location> Locations { get; set; }
        public DbSet<AuditEvent> AuditEvents { get; set; }
        public DbSet<OpeningImport> OpeningImports { get; set; }
        public DbSet<Role> Roles { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<Product> Products { get; set; }
        public DbSet<Batch> Batches { get; set; }
        public DbSet<TransferReservation> TransferReservations { get; set; }
        public DbSet<LotRecall> LotRecalls { get; set; }
        public IQueryable<LotRecall> ActiveLotRecalls => LotRecalls.Where(item => item.ClosedAt == null);
        public IQueryable<Batch> BatchesOutsideRecall => Batches.Where(batch => !ActiveLotRecalls.Any(recall =>
            recall.ProductId == batch.ProductId && recall.Lot == batch.BatchNumber));
        public DbSet<BatchStatusChange> BatchStatusChanges { get; set; }
        public DbSet<Sale> Sales { get; set; }
        public DbSet<CashShift> CashShifts { get; set; }
        public DbSet<ShiftMovement> ShiftMovements { get; set; }
        public DbSet<SaleItem> SaleItems { get; set; }
        public DbSet<TransferRequest> TransferRequests { get; set; }
        public DbSet<TransferReceipt> TransferReceipts { get; set; }
        public DbSet<StockCount> StockCounts { get; set; }
        public DbSet<InventoryTransaction> InventoryTransactions { get; set; }
        public DbSet<Supplier> Suppliers { get; set; }
        public DbSet<PurchaseOrder> PurchaseOrders { get; set; }
        public DbSet<PurchaseReceipt> PurchaseReceipts { get; set; }
        public DbSet<SupplierReturn> SupplierReturns { get; set; }
        public DbSet<ShortageAlert> ShortageAlerts { get; set; }
        public DbSet<ReorderRule> ReorderRules { get; set; }
    }
}
