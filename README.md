# PharmacyERP Backend

ASP.NET Core Web API على .NET 10 مع EF Core وSQL Server. الباك مسؤول عن الأسعار والمخزون والفواتير والصلاحيات. كل موقع له مخزون مستقل، وحركات التحويل بتربط المصدر والوجهة.

## تنظيم المشروع

| المسار | المسؤولية |
|---|---|
| `Program.cs` | تهيئة قاعدة البيانات، JWT، CORS، Swagger المحلي، فحوص التشغيل وHangfire |
| `Controllers/` | عقود HTTP والتحقق من الدور والموقع والمدخلات |
| `Services/` | البيع والخصم والحركات النقدية والتوريد والتحويل والتقارير |
| `Repositories/` | استعلامات الكتالوج والمخزون والمبيعات والمستخدمين والمواقع |
| `Models/` و`DTOs/` | كيانات قاعدة البيانات وعقود الطلبات والنتائج |
| `Data/` و`Migrations/` | EF Core، القيود، الإعداد المحلي وسجل التدقيق |
| `Middlewares/` و`BackgroundJobs/` | رد الأخطاء وتتبعها، وفحوص النقص والصلاحية المجدولة |

## التشغيل المحلي

من مجلد `PharmacyAPI` على Windows، جهّز SQL Server LocalDB. أنشئ مثيل `PharmacyERPDevelopment` مرة واحدة بـ `sqllocaldb create PharmacyERPDevelopment`.

```powershell
sqllocaldb start PharmacyERPDevelopment
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ConnectionStrings__DefaultConnection = 'Server=(localdb)\PharmacyERPDevelopment;Database=PharmacyERP_Local;Integrated Security=True;TrustServerCertificate=True'
$env:Jwt__Key = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:Bootstrap__Enabled = 'true'
$env:Bootstrap__AdminEmail = 'admin@example.test'
$env:Bootstrap__AdminPassword = Read-Host 'Local password of at least 12 characters' -MaskInput
$env:Jobs__Enabled = 'false'
dotnet run --no-launch-profile --urls http://127.0.0.1:5277
```

مع `Bootstrap__Enabled` في Development، التشغيل بيطبق الـmigrations ويضيف الأدوار ومدير أول عند خلو جدول المستخدمين. Swagger على `/swagger`. اطلب `GET /health/live` لحالة العملية و`GET /health/ready` للتحقق من اتصال SQL Server.

| الإعداد | استخدامه |
|---|---|
| `ConnectionStrings__DefaultConnection` | اتصال SQL Server |
| `Jwt__Key` | مفتاح التوقيع، 32 بايت على الأقل |
| `Cors__Origins__0` وما بعده | origins مسموحة لو الواجهة بتكلم API من عنوان مختلف |
| `Bootstrap__Enabled` / `Bootstrap__AdminEmail` / `Bootstrap__AdminPassword` | إنشاء قاعدة وحساب محلي في Development |
| `Jobs__Enabled` | تفعيل Hangfire والفحوص المجدولة |
| `Sales__UnapprovedDiscountPercent` | أقصى نسبة خصم مباشر، الافتراضي 5 |
| `SignIn__AttemptsPerMinute` | حد طلبات تسجيل الدخول لكل IP، الافتراضي 60 |

## مسارات الـAPI

| المجال | المسارات الأساسية |
|---|---|
| الهوية والإدارة | `POST /api/auth/login`، `GET /api/auth/session`، `/api/users`، `/api/users/roles`، `/api/locations` |
| البيع والشيفت | `/api/sales`، `/api/sales/{id}/returns`، `/api/sales/operations/{operationId}`، `/api/shifts`، `/api/discounts` |
| المخزون والكتالوج | `/api/products`، `/api/inventory/location/{id}`، `/api/inventory/batches/{id}/status`، `/api/inventory/lots`، `/api/stock-counts`، `/api/opening-stock` |
| التوريد والتحويلات | `/api/suppliers`، `/api/purchase-orders`، `/api/purchase-receipts/{id}/returns`، `/api/transfers` |
| المتابعة | `/api/dashboard`، `/api/reports/expiring`، `/api/reports/shortages`، `/api/reports/reconciliation`، `/api/reports/replenishment/{locationId}`، `/api/reports/audit` |

بتبعت التوكن في `Authorization: Bearer <token>`. الـAPI بيراجع إن الحساب والدور والموقع لسه نشطين. البيع بيحسب السعر من الكتالوج، وبيحفظ الفاتورة وحركة الدفعة داخل نفس المعاملة. مفاتيح إعادة المحاولة بتمنع تكرار عمليات البيع والاستلام والمرتجع. الاستلام والتسويات تخضع لصلاحيات الموقع، وحركات التدقيق مرتبطة بالمستخدم والعملية.

## البناء والتشغيل خارج Development

`dotnet build` يجمع المشروع. جهّز SQL Server ومفاتيح البيئة وأصول CORS، وطبّق المهاجرات على قاعدة منفصلة للاختبار قبل قاعدة التشغيل. حساب البداية في التشغيل يحتاج إجراء تهيئة إداري.
