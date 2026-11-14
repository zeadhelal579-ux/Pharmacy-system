// Simulates checkout, cash shifts, discounts and invoice returns.
import type { Session } from '../api'
import { addBatch, audit, canAccess, find, managers, now, permit, planStock, recordStock, replayOperation,
  requireDemo, roundMoney, sellers } from './domain'
import type { DemoData, DemoLine, DemoSale, Shift } from './seed'

type BasketLine = { productId: number; quantity: number; isPack?: boolean }
type Checkout = { shiftId: number; paymentMethod: string; items: BasketLine[]; discountAmount?: number;
  discountReason?: string; discountApprovalId?: number }
type Refund = { shiftId: number; saleItemId: number; quantity: number; reason: string; operationId: string }
type CashInput = { openingCash?: number; actualCash?: number; note?: string; kind?: string; amount?: number;
  reason?: string; operationId?: string }

export function salesRoutes(data: DemoData, actor: Session, route: string, method: string, body?: object, operationId?: string) {
  const current = data.shifts.find(item => item.userId === actor.userId && item.locationId === actor.locationId && !item.closedAt)
  if (route === '/shifts/current') return current ?? null
  if (route === '/shifts' && method === 'POST') {
    permit(actor, sellers)
    requireDemo(!current, 'فيه شيفت مفتوح بالفعل.')
    const { openingCash } = body as CashInput
    requireDemo(openingCash !== undefined && openingCash >= 0, 'أدخل رصيد افتتاح صحيح.', 400)
    const shift = { id: data.nextId++, userId: actor.userId, locationId: actor.locationId, openingCash, openedAt: now() }
    data.shifts.push(shift)
    audit(data, actor, { entity: 'CashShift', recordId: shift.id })
    return shift
  }
  const shiftAction = /^\/shifts\/(\d+)\/(close|movements)$/.exec(route)
  if (shiftAction && method === 'POST') {
    permit(actor, sellers)
    requireDemo(current?.id === Number(shiftAction[1]), 'افتح شيفت قبل تنفيذ الإجراء.')
    return updateShift(data, actor, current!, shiftAction[2], body as CashInput)
  }
  if (route === '/discounts' && method === 'GET') {
    return data.approvals.filter(item => canAccess(actor, item.locationId) &&
      (actor.role !== 'Cashier' || item.userId === actor.userId)).toReversed()
  }
  if (route === '/discounts' && method === 'POST') {
    permit(actor, sellers)
    const input = body as { shiftId: number; items: BasketLine[]; amount: number; reason: string }
    requireDemo(input.shiftId === current?.id && input.items.length > 0 && input.amount > 0 && input.reason.trim(),
      'راجع الشيفت والسلة وسبب الخصم.')
    const approval = { id: data.nextId++, userId: actor.userId, locationId: actor.locationId,
      shiftId: input.shiftId, amount: input.amount, reason: input.reason.trim(), cart: cartKey(input.items),
      approved: null, used: false }
    data.approvals.push(approval)
    audit(data, actor, { entity: 'DiscountApproval', recordId: approval.id, reason: approval.reason })
    return { id: approval.id }
  }
  const decision = /^\/discounts\/(\d+)\/decision$/.exec(route)
  if (decision && method === 'POST') {
    const approval = find(data.approvals, Number(decision[1]))
    permit(actor, managers, approval.locationId)
    requireDemo(approval.userId !== actor.userId && approval.approved === null, 'القرار يحتاج مديرًا غير صاحب الطلب.')
    approval.approved = (body as { approved: boolean }).approved
    audit(data, actor, { entity: 'DiscountApproval', recordId: approval.id, action: 'Updated', fields: 'Approved' })
    return { id: approval.id }
  }
  if (route === '/sales' && method === 'GET') return data.sales.filter(sale => canAccess(actor, sale.locationId)).toReversed()
  if (route === '/sales' && method === 'POST') {
    permit(actor, sellers)
    requireDemo(operationId, 'معرّف البيع مطلوب.', 400)
    return replayOperation(data, saleKey(actor, operationId), body!, () => checkout(data, actor, current, body as Checkout))
  }
  if (route.startsWith('/sales/operations/')) {
    const result = data.operations[saleKey(actor, route.split('/').at(-1)!)]?.result
    requireDemo(result, 'عملية البيع غير موجودة.', 404)
    return result
  }
  const receipt = /^\/sales\/(\d+)(\/returns)?$/.exec(route)
  if (!receipt) return undefined
  const sale = find(data.sales, Number(receipt[1]))
  requireDemo(canAccess(actor, sale.locationId), 'الفاتورة خارج نطاق الموقع.', 403)
  if (!receipt[2] && method === 'GET') return sale
  if (receipt[2] && method === 'POST') {
    permit(actor, sellers, sale.locationId)
    const input = body as Refund
    return replayOperation(data, 'refund:' + actor.userId + ':' + sale.id + ':' + input.operationId, input,
      () => refund(data, sale, current, input))
  }
  return undefined
}

function saleKey(actor: Session, operationId: string) {
  return ['sale', actor.userId, actor.locationId, operationId].join(':')
}

function cartKey(items: BasketLine[]) {
  return JSON.stringify(items.map(item => [item.productId, item.quantity, !!item.isPack] as const)
    .sort((first, second) => first[0] - second[0] || Number(first[2]) - Number(second[2]) || first[1] - second[1]))
}

function updateShift(data: DemoData, actor: Session, shift: Shift, action: string, input: CashInput) {
  if (action === 'close') {
    const movementTotal = data.movements.filter(item => item.shiftId === shift.id && item.kind !== 'CardRefund')
      .reduce((sum, item) => sum + item.amount, 0)
    const cashSales = data.sales.filter(sale => sale.shiftId === shift.id && sale.paymentMethod === 'Cash')
      .reduce((sum, sale) => sum + sale.totalAmount, 0)
    const expectedCash = roundMoney(shift.openingCash + cashSales + movementTotal)
    const actualCash = input.actualCash
    requireDemo(actualCash !== undefined && actualCash >= 0, 'أدخل النقد الفعلي.', 400)
    requireDemo(actualCash === expectedCash || input.note?.trim(), 'سجل سبب فرق النقدية.')
    Object.assign(shift, { expectedCash, actualCash, closeNote: input.note, closedAt: now() })
    audit(data, actor, { entity: 'CashShift', recordId: shift.id, action: 'Updated', reason: input.note })
    return shift
  }
  return replayOperation(data, 'cash:' + shift.id + ':' + input.operationId, input, () => {
    const { amount, kind, reason } = input
    requireDemo(amount && amount > 0 && reason?.trim() && (kind === 'Deposit' || kind === 'Withdrawal'),
      'راجع قيمة الحركة والسبب.', 400)
    const movement = { shiftId: shift.id, locationId: shift.locationId, kind,
      amount: kind === 'Withdrawal' ? -amount : amount, createdAt: now() }
    data.movements.push(movement)
    audit(data, actor, { entity: 'ShiftMovement', recordId: shift.id, reason })
    return movement
  })
}

function checkout(data: DemoData, actor: Session, shift: Shift | undefined, input: Checkout) {
  requireDemo(shift && shift.id === input.shiftId, 'افتح شيفت قبل البيع.')
  requireDemo(input.items.length > 0 && ['Cash', 'Card'].includes(input.paymentMethod), 'راجع السلة وطريقة الدفع.', 400)
  const saleItems: DemoLine[] = []
  for (const [index, line] of input.items.entries()) {
    const product = find(data.products, line.productId)
    const size = line.isPack ? product.packSize : 1
    const price = line.isPack ? product.packPrice : product.sellPrice
    requireDemo(size && price !== undefined, 'وحدة البيع غير متاحة.')
    let allocated = 0
    for (const { batch, quantity } of planStock(data, { productId: product.id, locationId: actor.locationId, quantity: size * line.quantity })) {
      const amount = roundMoney((allocated + quantity) * price / size) - roundMoney(allocated * price / size)
      allocated += quantity
      batch.quantity -= quantity
      saleItems.push({ id: data.nextId++, quantity, unitPrice: price, product: { ...product }, batchId: batch.id, amount,
        returned: 0, unitsPerPack: size, soldUnit: line.isPack ? product.packName : product.unit, lineNumber: index + 1 })
      recordStock(data, actor.locationId, 'Sale', quantity)
    }
  }
  const gross = roundMoney(saleItems.reduce((total, item) => total + (item.amount ?? 0), 0))
  const discount = input.discountAmount ?? 0
  if (discount) applyDiscount(data, actor, { input, saleItems, gross, discount })
  const sale = { id: data.nextId++, userId: actor.userId, locationId: actor.locationId, shiftId: shift.id,
    createdAt: now(), totalAmount: roundMoney(gross - discount), saleItems, discountAmount: discount,
    paymentMethod: input.paymentMethod }
  data.sales.push(sale)
  audit(data, actor, { entity: 'Sale', recordId: sale.id, reason: input.discountReason })
  return { saleId: sale.id }
}

function applyDiscount(data: DemoData, actor: Session, bill: {
  input: Checkout; saleItems: DemoLine[]; gross: number; discount: number
}) {
  const { input, saleItems, gross, discount } = bill
  const reason = input.discountReason?.trim()
  requireDemo(discount > 0 && discount <= gross && reason, 'راجع قيمة الخصم وسببه.')
  if (discount > gross * 0.05 || input.discountApprovalId) {
    const approval = data.approvals.find(item => item.id === input.discountApprovalId)
    requireDemo(approval?.approved && !approval.used && approval.userId === actor.userId &&
      approval.locationId === actor.locationId && approval.shiftId === input.shiftId && approval.amount === discount &&
      approval.cart === cartKey(input.items) && approval.reason === reason,
    'الخصم يحتاج موافقة مدير على نفس السلة والمبلغ.')
    approval.used = true
  }
  let subtotal = 0
  let applied = 0
  for (const item of saleItems) {
    subtotal += item.amount ?? 0
    const cumulative = roundMoney(discount * subtotal / gross)
    item.amount = roundMoney((item.amount ?? 0) - cumulative + applied)
    applied = cumulative
  }
}

function refund(data: DemoData, sale: DemoSale, shift: Shift | undefined, input: Refund) {
  requireDemo(shift && shift.id === input.shiftId && shift.locationId === sale.locationId, 'افتح شيفت في فرع الفاتورة.')
  const line = find(sale.saleItems, input.saleItemId)
  requireDemo(Number.isInteger(input.quantity) && input.quantity > 0 && input.quantity <= line.quantity - line.returned &&
    input.reason.trim(), 'راجع كمية المرتجع والسبب.')
  const price = line.amount ?? line.unitPrice * line.quantity
  const amount = roundMoney(price * (line.returned + input.quantity) / line.quantity) -
    roundMoney(price * line.returned / line.quantity)
  line.returned += input.quantity
  const original = find(data.batches, line.batchId)
  addBatch(data, { ...original, quantity: input.quantity, isQuarantined: true })
  const kind = sale.paymentMethod === 'Card' ? 'CardRefund' : 'CashRefund'
  data.movements.push({ shiftId: shift.id, locationId: sale.locationId, kind, amount: -amount, createdAt: now() })
  recordStock(data, sale.locationId, kind, input.quantity)
  return { amount }
}
