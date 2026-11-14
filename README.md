# PharmacyERP Frontend

واجهة تشغيل الصيدلية المتصلة بـ ASP.NET Core API. مبنية بـ React وTypeScript وVite وTailwind CSS. نقطة البيع والتنقل والشاشات الرئيسية فيها اختيار عربي RTL وإنجليزي LTR. بعض النماذج الإدارية لسه معروضة بالعربي.

## التشغيل

ثبّت Node.js 24. شغّل الباك على `http://127.0.0.1:5277` مع SQL Server وحساب Development. من مجلد الواجهة:

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

افتح `http://127.0.0.1:5173`. `vite.config.ts` بيمرر `/api` و`/health` للباك في التشغيل المحلي. لو هتخدم build الواجهة في بيئة متصلة، وجّه `/api/*` للباك ومَسارات React لـ `index.html` على الـorigin المخصص. سجّل بحساب متكوّن في قاعدة البيانات.

## الملفات

| الملف أو المجموعة | دوره |
|---|---|
| `src/main.tsx` و`src/App.tsx` | دخول، جلسة المتصفح، التنقل حسب الدور، Dashboard وتقارير وفواتير |
| `src/api.ts` | عقود مشتركة وطلبات JSON وترويسة Bearer و`Idempotency-Key` عند الحاجة |
| `Pos.tsx` و`ShiftPanel.tsx` و`CashReturn.tsx` و`Discounts.tsx` | مسح الباركود والسلة والشيفت والمرتجع واعتماد الخصم |
| `Catalog.tsx` و`BatchStatus.tsx` و`OpeningStock.tsx` و`StockCounts.tsx` | إدارة الأصناف وعزل الدفعات واستيراد TSV والجرد |
| `Purchasing.tsx` و`Transfers.tsx` و`Replenishment.tsx` | الموردين وأوامر الشراء والتحويلات واقتراح إعادة الطلب |
| `LotTrace.tsx` و`Reconciliation.tsx` و`AuditLog.tsx` و`UserManagement.tsx` | تتبع الدفعات، المطابقة، سجل التدقيق وإدارة الحسابات |
| `Language.tsx` و`language-context.ts` و`index.css` | اللغة واتجاه العرض والأنماط المشتركة والطباعة |

جلسة الدخول في ذاكرة التطبيق وبتحتاج تسجيل دخول من جديد بعد التحديث. البيع المعلّق بيتحفظ في نفس التبويب علشان الواجهة تستعلم عن نتيجته أو تعيد إرساله بنفس المعرّف. السعر والمخزون وصلاحية الفعل بيتحقق منهم الباك.

## البناء والتحقق

```sh
npm run lint
npm run build
npm run preview
```

الـbuild بيطلع في `dist`. شغّل الـAPI من فرع [`back-end`](https://github.com/zeadhelal579-ux/Pharmacy-system/tree/back-end) لتجربة الواجهة المتصلة. نسخة العرض المستقلة موجودة في فرع [`front-Deploy`](https://github.com/zeadhelal579-ux/Pharmacy-system/tree/front-Deploy).
