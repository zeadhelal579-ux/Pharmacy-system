// ============================================================
// Program.cs
// ------------------------------------------------------------
// Purpose: Application entry point — registers every service in
// the DI container, then builds the middleware pipeline in the
// exact order requests flow through it.
//
// Service registration order (top to bottom):
//   1. AppDbContext — SQL Server, connection string from
//      appsettings.json ("ConnectionStrings:DefaultConnection").
//   2. Hangfire — same connection string, used for background jobs.
//   3. Controllers, Swagger, CORS ("AllowAll" policy — open for dev).
//   4. AutoMapper — scans this assembly for Profile classes
//      (MappingProfile.cs).
//   5. JWT Authentication — reads Jwt:Key from appsettings.json,
//      validates lifetime + signing key only (no issuer/audience
//      checks, fine for a single-server local setup).
//   6. Repositories (Scoped): IProductRepository, IInventoryRepository,
//      ISaleRepository, ILocationRepository, IUserRepository.
//   7. Services (Scoped): AuthService, InventoryService, SalesService,
//      TransferService, ReportService, DashboardService.
//   8. Background Jobs (Scoped): ExpiryCheckerJob, LowStockCheckerJob.
//
// Middleware pipeline order (after builder.Build()):
//   1. Swagger (Development only).
//   2. UseCors("AllowAll").
//   3. ExceptionHandlerMiddleware — catches everything below it.
//   4. UseHttpsRedirection.
//   5. UseAuthentication — MUST come before UseAuthorization (reads
//      the Bearer token and populates the request's User identity).
//   6. UseAuthorization — checks [Authorize] attributes against the
//      identity UseAuthentication just set.
//   7. UseHangfireDashboard("/hangfire").
//   8. RecurringJob.AddOrUpdate — registers both daily background
//      jobs (ExpiryCheckerJob, LowStockCheckerJob) with Hangfire.
//   9. MapControllers, Run.
//
// This ordering is deliberate and load-bearing: swapping steps 5
// and 6 would make every [Authorize] attribute in the project treat
// every request as anonymous, regardless of a valid token.
//
// Architecture note (consistency pass): ILocationRepository/
// LocationRepository, IUserRepository/UserRepository, and
// DashboardService are new registrations added in this pass — they
// back LocationsController, UsersController, and DashboardController,
// which previously injected AppDbContext directly instead of going
// through the repository/service layers. No other registration
// changed. (Also folded a duplicate "// Controllers" comment that
// existed above the AddControllers() call in the original file.)
// ============================================================
using Hangfire;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.BackgroundJobs;
using PharmacyAPI.Data;
using PharmacyAPI.Middlewares;
using PharmacyAPI.Repositories;
using PharmacyAPI.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHttpContextAccessor();
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("Set ConnectionStrings__DefaultConnection.");

var enableJobs = builder.Configuration.GetValue("Jobs:Enabled", true);

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connectionString));

// Hangfire
if (enableJobs)
{
    builder.Services.AddHangfire(config => config.UseSqlServerStorage(connectionString));
    builder.Services.AddHangfireServer();
}

// Controllers
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler =
            System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("SignIn", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = Math.Max(1, builder.Configuration.GetValue("SignIn:AttemptsPerMinute", 60)),
            Window = TimeSpan.FromMinutes(1)
        }));
});

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
            .AllowAnyMethod().AllowAnyHeader();
    });
});

// JWT Authentication
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Set Jwt__Key to at least 32 bytes.");
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = async validation =>
        {
            var principal = validation.Principal!;
            if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            {
                validation.Fail("Invalid account");
                return;
            }

            var database = validation.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
            var account = await database.Users.AsNoTracking()
                .Where(user => user.Id == userId && !user.IsDeleted &&
                    !user.Role.IsDeleted && !user.Location.IsDeleted)
                .Select(user => new { user.LocationId, Role = user.Role.Name })
                .SingleOrDefaultAsync(validation.HttpContext.RequestAborted);
            if (account is null || account.LocationId.ToString() != principal.FindFirstValue("LocationId") ||
                !principal.IsInRole(account.Role))
                validation.Fail("Account access changed");
        }
    };
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = false,
        ValidateAudience = false,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
    };
});

// Repositories
builder.Services.AddScoped<IProductRepository, ProductRepository>();
builder.Services.AddScoped<IInventoryRepository, InventoryRepository>();
builder.Services.AddScoped<ISaleRepository, SaleRepository>();
builder.Services.AddScoped<ILocationRepository, LocationRepository>();
builder.Services.AddScoped<IUserRepository, UserRepository>();

// Services
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<InventoryService>();
builder.Services.AddScoped<SalesService>();
builder.Services.AddScoped<ShiftService>();
builder.Services.AddScoped<ShiftMovementService>();
builder.Services.AddScoped<PurchasingService>();
builder.Services.AddScoped<SupplierReturnsService>();
builder.Services.AddScoped<TransferService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<DashboardService>();

// Background Jobs
builder.Services.AddScoped<ExpiryCheckerJob>();
builder.Services.AddScoped<LowStockCheckerJob>();

var app = builder.Build();

if (app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("Bootstrap:Enabled"))
{
    await using var scope = app.Services.CreateAsyncScope();
    await DevelopmentSeed.ApplyAsync(
        scope.ServiceProvider.GetRequiredService<AppDbContext>(), app.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Frontend");
app.UseMiddleware<ExceptionHandlerMiddleware>();
app.UseHttpsRedirection();
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
if (enableJobs)
{
    var jobs = app.Services.GetRequiredService<IRecurringJobManager>();
    jobs.AddOrUpdate<ExpiryCheckerJob>("expiry-checker", job => job.CheckExpiringBatchesAsync(), Cron.Daily);
    jobs.AddOrUpdate<LowStockCheckerJob>("lowstock-checker", job => job.CheckLowStockAsync(), Cron.Daily);
}

app.MapGet("/health/live", () => Results.Ok()).AllowAnonymous();
app.MapGet("/health/ready", async (AppDbContext context, CancellationToken cancellationToken) =>
    await context.Database.CanConnectAsync(cancellationToken)
        ? Results.Ok()
        : Results.StatusCode(StatusCodes.Status503ServiceUnavailable)).AllowAnonymous();

app.MapControllers();
app.Run();
