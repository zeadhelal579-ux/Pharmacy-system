// Resolves location scope for authenticated API callers.
using System.Security.Claims;

namespace PharmacyAPI.Controllers;

internal static class LocationAccess
{
    public static int? Scope(this ClaimsPrincipal user) =>
        user.IsInRole("SuperAdmin") ? null :
        int.TryParse(user.FindFirstValue("LocationId"), out var id) ? id : 0;

    public static bool CanAccess(this ClaimsPrincipal user, int locationId) =>
        locationId > 0 && (user.Scope() is not int scope || scope == locationId);
}
