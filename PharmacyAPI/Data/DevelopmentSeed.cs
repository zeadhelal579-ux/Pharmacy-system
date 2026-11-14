// Seeds local roles, locations, and an administrator when explicitly requested.
using Microsoft.EntityFrameworkCore;
using PharmacyAPI.Models;

namespace PharmacyAPI.Data;

internal static class DevelopmentSeed
{
    public static async Task ApplyAsync(AppDbContext context, IConfiguration configuration)
    {
        var email = configuration["Bootstrap:AdminEmail"];
        var password = configuration["Bootstrap:AdminPassword"];
        if (string.IsNullOrWhiteSpace(email) || password is null || password.Length < 12)
            throw new InvalidOperationException("Set Bootstrap admin email and a password of at least 12 characters.");

        await context.Database.MigrateAsync();
        if (await context.Users.AnyAsync()) return;

        var roles = new[] { "SuperAdmin", "BranchManager", "Cashier", "WarehouseAdmin" }
            .Select(name => new Role { Name = name }).ToArray();
        var branch = new Location { Name = "فرع العرض", Type = "Branch" };
        context.Roles.AddRange(roles);
        context.Locations.AddRange(branch, new Location { Name = "المخزن الرئيسي", Type = "Warehouse" });
        context.Users.Add(new User
        {
            Name = "مدير النظام",
            Email = email.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Role = roles[0],
            Location = branch
        });
        await context.SaveChangesAsync();
    }
}
