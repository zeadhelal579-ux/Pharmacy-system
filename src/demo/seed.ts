// Provides fictional, internally linked pharmacy records for a fresh demo.
import type { Batch, Product, Sale } from '../api'
import { profiles } from './roles'

export type DemoBatch = Omit<Batch, 'product'> & { productId: number; locationId: number; cost: number }
export type DemoLine = Sale['saleItems'][number] & { batchId: number; returned: number }
export type DemoSale = Omit<Sale, 'saleItems'> & {
  locationId: number; userId: number; shiftId: number; saleItems: DemoLine[]
}
export type Staff = { id: number; name: string; email: string; roleId: number; locationId: number; disabled?: boolean }
export type Shift = { id: number; userId: number; locationId: number; openingCash: number; openedAt: string;
  actualCash?: number; expectedCash?: number; closedAt?: string; closeNote?: string }
export type Movement = { shiftId: number; locationId: number; kind: string; amount: number; createdAt: string }
export type Allocation = { batchId: number; quantity: number }
export type Shipment = { id: number; batchNumber?: string; expiryDate: string; cost: number;
  isQuarantined: boolean; shipped: number; accepted: number; damaged: number; missing: number }
export type Transfer = { id: number; productId: number; fromLocationId: number; toLocationId: number;
  requestedByUserId: number; quantity: number; status: string; reservations: Allocation[]; lines: Shipment[] }
export type Order = { id: number; supplierId: number; locationId: number; approvedAt?: string;
  lines: { id: number; productId: number; quantity: number; unitCost: number; received: number }[] }
export type PurchaseReceipt = { id: number; orderId: number; productId: number; batchId: number;
  invoiceNumber: string; quantity: number; unitCost: number; returned: number }
export type Count = { id: number; batchId: number; baseline: number; counted: number; reason: string; approvedAt?: string }
export type Audit = { id: number; userId: number; locationId?: number; destinationId?: number;
  occurredAt: string; entity: string; action: string; recordId?: number; reason?: string; fields: string }
export type Approval = { id: number; userId: number; locationId: number; shiftId: number; amount: number;
  reason: string; cart: string; approved: boolean | null; used: boolean }
export type BatchDecision = { id: number; batchId: number; userId: number; quarantined: boolean; reason: string; createdAt: string }
export type Recall = { id: number; productId: number; lot: string; reason: string; openedAt: string; closedAt?: string }
export type StockMovement = { locationId: number; kind: string; quantity: number; createdAt: string }
export type Replay = { fingerprint: string; result: unknown }
export type DemoData = {
  nextId: number; users: Staff[]; products: Product[]; batches: DemoBatch[]; sales: DemoSale[];
  shifts: Shift[]; movements: Movement[]; transfers: Transfer[]; suppliers: { id: number; name: string; contact?: string }[];
  orders: Order[]; purchaseReceipts: PurchaseReceipt[]; counts: Count[]; audit: Audit[]; approvals: Approval[];
  batchDecisions: BatchDecision[]; recalls: Recall[]; stockMovements: StockMovement[];
  reorderRules: Record<string, number>; imports: string[]; operations: Record<string, Replay>
}

export function demoDate(days = 0) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-')
}

export function createDemoData(): DemoData {
  const catalog = [
    ['باراسيتامول 500 مجم', 'مسكنات', 12, 8], ['أقراص فيتامين سي', 'فيتامينات', 39, 27],
    ['محلول ملحي للأنف', 'العناية اليومية', 42, 31], ['شاش معقم', 'إسعافات أولية', 15, 9],
    ['كمامات طبية', 'مستلزمات', 7, 4], ['جل معقم لليدين', 'العناية اليومية', 54, 38],
    ['لاصق جروح', 'إسعافات أولية', 24, 16], ['ميزان حرارة رقمي', 'أجهزة', 195, 142],
    ['قطن طبي', 'مستلزمات', 28, 19], ['محلول إماهة فموية', 'العناية اليومية', 11, 7],
    ['مرطب شفاه', 'العناية الشخصية', 60, 43], ['ميزان حرارة للأطفال', 'أجهزة', 230, 165],
  ] as const
  const products: Product[] = catalog.map(([name, category, sellPrice, buyPrice], index) => ({
    id: index + 1, barcode: String(62000001 + index), name, category, sellPrice, buyPrice,
    unit: index === 0 ? 'شريط' : 'قطعة', minStock: index === 7 ? 4 : 12,
  }))
  products[0] = { ...products[0], packName: 'علبة', packBarcode: '62009901', packSize: 3, packPrice: 32 }
  const batches: DemoBatch[] = products.flatMap((product, index) => [1, 2, 3].map(locationId => ({
    id: 10 * product.id + locationId, productId: product.id, locationId, cost: product.buyPrice ?? 0,
    batchNumber: 'RX-' + String(2401 + index), expiryDate: demoDate(index < 2 ? 21 + index * 30 : 150 + index * 8),
    quantity: locationId === 3 ? 64 + index * 3 : index === 3 || index === 7 ? 2 : 20 + index,
    isQuarantined: index === 5 && locationId === 1, reservedQuantity: 0,
  })))
  batches.push({ ...batches[0], id: 150, quantity: 22, batchNumber: 'RX-2506', expiryDate: demoDate(210) })
  const now = new Date().toISOString()
  const sales: DemoSale[] = Array.from({ length: 8 }, (_, index) => {
    const product = products[index]
    const quantity = index % 3 + 1
    const locationId = index < 6 ? 1 : 2
    const totalAmount = product.sellPrice * quantity
    return {
      id: 1001 + index, createdAt: index < 4 ? now : demoDate(-1) + 'T11:00:00',
      totalAmount, locationId, userId: locationId === 1 ? 3 : 9,
      shiftId: locationId === 2 ? 603 : index < 4 ? 601 : 602,
      paymentMethod: index % 2 ? 'Card' : 'Cash',
      saleItems: [{ id: 1101 + index, product, quantity, unitPrice: product.sellPrice, lineNumber: 1,
        soldUnit: product.unit, unitsPerPack: 1, amount: totalAmount, batchId: 10 * product.id + locationId, returned: 0 }],
    }
  })
  return {
    nextId: 2000, products, batches, sales,
    users: profiles.map<Staff>((profile, index) => ({
      id: profile.userId, name: profile.name, email: profile.email, roleId: index + 1, locationId: profile.locationId,
    })).concat([
      { id: 8, name: 'سلمى مصطفى', email: 'salma@pharmacy.example', roleId: 2, locationId: 2 },
      { id: 9, name: 'زياد محمود', email: 'ziad@pharmacy.example', roleId: 3, locationId: 2 },
    ]),
    shifts: [
      { id: 601, userId: 3, locationId: 1, openingCash: 250, openedAt: now },
      { id: 602, userId: 3, locationId: 1, openingCash: 250, openedAt: demoDate(-1),
        closedAt: demoDate(-1), expectedCash: 264, actualCash: 262, closeNote: 'فرق نقدي مسجل عند الإقفال' },
      { id: 603, userId: 9, locationId: 2, openingCash: 200, openedAt: demoDate(-1),
        closedAt: demoDate(-1), expectedCash: 224, actualCash: 224 },
    ],
    movements: [{ shiftId: 601, locationId: 1, kind: 'Deposit', amount: 100, createdAt: now }],
    transfers: [
      { id: 401, productId: 4, fromLocationId: 3, toLocationId: 1, requestedByUserId: 2, quantity: 24,
        status: 'Pending', reservations: [], lines: [] },
      { id: 402, productId: 2, fromLocationId: 3, toLocationId: 1, requestedByUserId: 2, quantity: 18,
        status: 'InTransit', reservations: [],
        lines: [{ id: 411, batchNumber: 'RX-2402', expiryDate: batches[3].expiryDate, cost: 27,
          isQuarantined: false, shipped: 18, accepted: 0, damaged: 0, missing: 0 }] },
    ],
    suppliers: [{ id: 201, name: 'النيل للتوريدات الطبية', contact: 'nile@pharmacy.example' },
      { id: 202, name: 'الدلتا للمستلزمات', contact: 'delta@pharmacy.example' }],
    orders: [
      { id: 301, supplierId: 201, locationId: 1, approvedAt: now,
        lines: [{ id: 311, productId: 4, quantity: 40, unitCost: 9, received: 0 }] },
      { id: 302, supplierId: 202, locationId: 3,
        lines: [{ id: 312, productId: 7, quantity: 80, unitCost: 16, received: 0 }] },
      { id: 303, supplierId: 201, locationId: 1, approvedAt: now,
        lines: [{ id: 313, productId: 1, quantity: 40, unitCost: 8, received: 40 }] },
    ],
    purchaseReceipts: [{ id: 321, orderId: 303, productId: 1, batchId: 150, invoiceNumber: 'INV-DEMO-140',
      quantity: 40, unitCost: 8, returned: 0 }],
    counts: [{ id: 501, batchId: 21, baseline: 21, counted: 19, reason: 'فرق عدّ أثناء الجرد الدوري' }],
    approvals: [{ id: 701, userId: 3, locationId: 1, shiftId: 601, amount: 10,
      reason: 'خصم على عبوتين في عملية تجريبية', cart: '[[1,2,true]]', approved: null, used: false }],
    audit: [
      { id: 901, userId: 2, locationId: 1, occurredAt: now, entity: 'BatchStatusChange',
        action: 'Created', recordId: 61, reason: 'عبوة تالفة أثناء الاستلام', fields: 'IsQuarantined' },
      { id: 902, userId: 4, locationId: 3, destinationId: 1, occurredAt: now, entity: 'TransferRequest',
        action: 'Updated', recordId: 402, fields: 'Status' },
    ],
    batchDecisions: [{ id: 903, batchId: 61, userId: 2, quarantined: true, reason: 'عبوة تالفة أثناء الاستلام', createdAt: now }],
    recalls: [], stockMovements: [
      ...sales.map(sale => ({ locationId: sale.locationId, kind: 'Sale',
        quantity: sale.saleItems[0].quantity, createdAt: sale.createdAt })),
      { locationId: 3, kind: 'TransferDispatch', quantity: 18, createdAt: now },
    ],
    reorderRules: { '1:4': 20 }, imports: [], operations: {},
  }
}
