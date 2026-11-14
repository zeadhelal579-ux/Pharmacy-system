// Shares access rules, stock allocation and audit records across the demo workflows.
import type { Session } from '../api'
import { locations } from './roles'
import { demoDate } from './seed'
import type { DemoBatch, DemoData } from './seed'

export class DemoError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function requireDemo(condition: unknown, message: string, status = 409): asserts condition {
  if (!condition) throw new DemoError(status, message)
}

export function find<T extends { id: number }>(records: T[], id: number): T {
  const record = records.find(item => item.id === id)
  requireDemo(record, 'العنصر المطلوب غير موجود.', 404)
  return record
}

export function canAccess(actor: Session, locationId: number) {
  return actor.role === 'SuperAdmin' || actor.locationId === locationId
}

export function permit(actor: Session, roles: string[], locationId?: number) {
  requireDemo(roles.includes(actor.role) && (locationId === undefined || canAccess(actor, locationId)),
    'الدور الحالي غير مصرح له بالإجراء في هذا الموقع.', 403)
}

export const managers = ['SuperAdmin', 'BranchManager']
export const stockOperators = [...managers, 'WarehouseAdmin']
export const sellers = [...managers, 'Cashier']
export const now = () => new Date().toISOString()
export const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100

export function batchView(data: DemoData, batch: DemoBatch) {
  return { ...batch, product: find(data.products, batch.productId) }
}

export function isRecalled(data: DemoData, batch: DemoBatch) {
  return data.recalls.some(recall => !recall.closedAt && recall.productId === batch.productId && recall.lot === batch.batchNumber)
}

export function freeQuantity(data: DemoData, batch: DemoBatch) {
  const product = find(data.products, batch.productId)
  if (batch.isQuarantined || product.isDeleted || batch.expiryDate < demoDate() || isRecalled(data, batch)) return 0
  return batch.quantity - (batch.reservedQuantity ?? 0)
}

export function planStock(data: DemoData, request: { productId: number; locationId: number; quantity: number }) {
  let remaining = request.quantity
  requireDemo(Number.isSafeInteger(remaining) && remaining > 0, 'أدخل كمية صحيحة.', 400)
  const parts = []
  const candidates = data.batches.filter(batch => batch.productId === request.productId && batch.locationId === request.locationId)
    .sort((first, second) => first.expiryDate.localeCompare(second.expiryDate) || first.id - second.id)
  for (const batch of candidates) {
    const quantity = Math.min(remaining, freeQuantity(data, batch))
    if (!quantity) continue
    parts.push({ batch, quantity })
    remaining -= quantity
    if (remaining === 0) return parts
  }
  throw new DemoError(409, 'الكمية المتاحة غير كافية.')
}

export function addBatch(data: DemoData, input: Omit<DemoBatch, 'id' | 'reservedQuantity'>) {
  const batch = { ...input, id: data.nextId++, reservedQuantity: 0 }
  if (isRecalled(data, batch)) batch.isQuarantined = true
  data.batches.push(batch)
  return batch
}

export function audit(data: DemoData, actor: Session, event: {
  entity: string; recordId: number; action?: string; locationId?: number; destinationId?: number; reason?: string; fields?: string
}) {
  data.audit.unshift({ id: data.nextId++, occurredAt: now(), userId: actor.userId,
    action: 'Created', fields: '', locationId: actor.locationId, ...event })
}

export function recordStock(data: DemoData, locationId: number, kind: string, quantity: number) {
  data.stockMovements.push({ locationId, kind, quantity, createdAt: now() })
}

export function replayOperation(data: DemoData, key: string, body: object, run: () => unknown) {
  const fingerprint = JSON.stringify(body)
  const previous = data.operations[key]
  if (previous) {
    requireDemo(previous.fingerprint === fingerprint, 'معرّف العملية مرتبط بطلب مختلف.')
    return previous.result
  }
  const result = run()
  data.operations[key] = { fingerprint, result }
  return result
}

export function locationView(id: number) {
  return find(locations, id)
}
