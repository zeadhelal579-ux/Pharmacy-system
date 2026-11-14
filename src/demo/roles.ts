// Defines the four accounts available on the demo sign-in screen.
export const locations = [
  { id: 1, name: 'فرع المعادي' },
  { id: 2, name: 'فرع مدينة نصر' },
  { id: 3, name: 'المخزن المركزي' },
]

export const profiles = [
  { userId: 1, locationId: 1, role: 'SuperAdmin', email: 'admin@pharmacy.example', name: 'مريم عادل',
    title: ['مدير النظام', 'System administrator'],
    description: ['راقب الفروع وأدر المستخدمين وقرارات السحب.', 'Oversee branches, staff access and recalls.'], start: '/' },
  { userId: 2, locationId: 1, role: 'BranchManager', email: 'manager@pharmacy.example', name: 'أحمد سالم',
    title: ['مدير الفرع', 'Branch manager'],
    description: ['راجع النواقص واعتمد الجرد والخصومات.', 'Review shortages, stock counts and discounts.'], start: '/' },
  { userId: 3, locationId: 1, role: 'Cashier', email: 'cashier@pharmacy.example', name: 'ندى حسن',
    title: ['كاشير', 'Cashier'],
    description: ['جرّب البيع وإصدار فاتورة من شيفت مفتوح.', 'Make a sale and issue a receipt from an open shift.'], start: '/pos' },
  { userId: 4, locationId: 3, role: 'WarehouseAdmin', email: 'warehouse@pharmacy.example', name: 'عمر علي',
    title: ['مسؤول المخزن', 'Warehouse operator'],
    description: ['جهّز تحويلات الفروع وتابع التوريد والدفعات.', 'Dispatch branch transfers and review incoming stock.'], start: '/transfers' },
] as const

export const roles = profiles.map((profile, index) => ({ id: index + 1, name: profile.role }))
export type Profile = typeof profiles[number]
