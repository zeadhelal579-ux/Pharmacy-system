# تشغيل نسخة React والـAPI محليًا

المسار الجديد للواجهة هو `front-end/pharmacy-web`. التشغيل المحلي يحتاج Node 24 و.NET 10 وSQL Server. لو هتستخدم LocalDB على Windows، ممكن تنشئ مثيل باسم `PharmacyERPDevelopment` باستخدام `sqllocaldb create PharmacyERPDevelopment`.

من فولدر `back-end/PharmacyERP/PharmacyAPI` افتح PowerShell ونفّذ:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ConnectionStrings__DefaultConnection = 'Server=(localdb)\PharmacyERPDevelopment;Database=PharmacyERP_Local;Integrated Security=True;TrustServerCertificate=True'
$env:Jwt__Key = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:Bootstrap__Enabled = 'true'
$env:Bootstrap__AdminEmail = 'admin@example.test'
$env:Bootstrap__AdminPassword = Read-Host 'Local admin password (at least 12 characters)' -MaskInput
$env:Jobs__Enabled = 'false'
dotnet run --no-launch-profile --urls http://127.0.0.1:5277
```

التهيئة بتطبّق المهاجرات في بيئة Development وبتنشئ أول مدير عند خلو جدول المستخدمين. كلمة المرور المدخلة بتستخدم عند الإنشاء الأول فقط. لو عندك قاعدة من نسخة المشروع القديمة، خُد نسخة منفصلة وراجع ترقية الـschema قبل استخدام المهاجرة الأولى معاها.

في نافذة ثانية داخل `front-end/pharmacy-web`:

```powershell
npm ci
npm run dev -- --host 127.0.0.1
```

افتح [واجهة التطوير](http://127.0.0.1:5173) وسجّل بالحساب اللي أنشأته. صفحة [جاهزية الـAPI](http://127.0.0.1:5277/health/ready) تختبر اتصال قاعدة البيانات. سيناريو إنشاء أصناف ودفعات والبيع عليها موجود في الاختبار المتكامل. من جذر المشروع بعد بناء الـAPI وتثبيت اعتمادات الواجهة:

```powershell
npm ci --prefix tests-audit
npm run build --prefix front-end/pharmacy-web
pwsh -NoProfile -File tests-audit/Run-Integration.ps1
```

لتشغيل تمرين النسخ والاستعادة بعد الاختبارات، استخدم `pwsh -NoProfile -File tests-audit/Run-Integration.ps1 -BackupRestore` مع `sqlcmd`. التمرين ينسخ قاعدة الاختبار باستخدام CHECKSUM، يستعيدها باسم مستقل، ويقارن بيانات الفواتير وبنودها والدفعات وحركات المخزون. السكريبت يحذف نسخة الاستعادة المؤقتة بعد القياس. مواعيد وحفظ النسخ وأهداف زمن الاستعادة وفقد البيانات لبيئة الفرع تتحدد مع فريق التشغيل.

السكريبت يستخدم Microsoft Edge ومثيل LocalDB المخصص، وينشئ قاعدة باسم فريد لكل تشغيل. السيرفرين بيتقفلوا تلقائيًا بعد الاختبار. قاعدة الاختبار بتفضل متاحة لفحص النتائج.
