// Derives dashboard, availability and reconciliation from current demo records.
import type { Session } from '../api'
import { audit, batchView, canAccess, find, freeQuantity, locationView, managers, permit, requireDemo,
  roundMoney, stockOperators } from './domain'
import { locations } from './roles'
import { demoDate } from './seed'
import type { DemoData } from './seed'

export function reportRoutes(data: DemoData, actor: Session, url: URL, method: string, body?: object) {
  const route = url.pathname
  const visibleLocations = locations.filter(location => canAccess(actor, location.id))
  if (route === '/dashboard') {
    const today = demoDate()
    return {
      totalProducts: data.products.filter(item => !item.isDeleted).length,
      totalSalesToday: roundMoney(data.sales.filter(item => onLocalDate(item.createdAt) === today &&
        canAccess(actor, item.locationId)).reduce((sum, item) => sum + item.totalAmount, 0)),
      totalLocations: visibleLocations.length,
      pendingTransfers: data.transfers.filter(item => (canAccess(actor, item.fromLocationId) || canAccess(actor, item.toLocationId)) &&
        ['Pending', 'ReadyToShip', 'InTransit', 'PartiallyReceived'].includes(item.status)).length,
      shortageAlerts: visibleLocations.flatMap(item => plans(data, item.id)).filter(item => item.available < item.minimum).length,
      expiringBatches: expiring(data, actor).length,
    }
  }
  if (route === '/reports/expiring') return expiring(data, actor)
  if (route === '/reports/shortages') {
    return visibleLocations.flatMap(location => plans(data, location.id).filter(item => item.available < item.minimum)
      .map(item => ({ id: location.id * 100000 + item.productId, product: find(data.products, item.productId),
        currentQuantity: item.available, location })))
  }
  if (route === '/reports/audit') {
    permit(actor, managers)
    const locationId = Number(url.searchParams.get('locationId'))
    const before = Number(url.searchParams.get('beforeId'))
    if (locationId) requireDemo(canAccess(actor, locationId), 'السجل خارج نطاق الموقع.', 403)
    return data.audit.filter(item => (!before || item.id < before) &&
      (locationId ? [item.locationId, item.destinationId].includes(locationId) :
        actor.role === 'SuperAdmin' || [item.locationId, item.destinationId].includes(actor.locationId)))
      .sort((first, second) => second.id - first.id).slice(0, 50)
  }
  if (route === '/reports/reconciliation') {
    permit(actor, managers)
    return reconcile(data, actor, url.searchParams)
  }
  const replenishment = /^\/reports\/replenishment\/(\d+)(?:\/(\d+))?$/.exec(route)
  if (!replenishment) return undefined
  const locationId = Number(replenishment[1])
  locationView(locationId)
  permit(actor, stockOperators, locationId)
  if (!replenishment[2] && method === 'GET') return plans(data, locationId)
  if (method !== 'PUT') return undefined
  permit(actor, managers)
  const productId = Number(replenishment[2])
  const { minimum } = body as { minimum: number }
  requireDemo(Number.isInteger(minimum) && minimum >= 0 && minimum <= 1000000, 'أدخل حد إعادة طلب صحيح.', 400)
  find(data.products, productId)
  data.reorderRules[locationId + ':' + productId] = minimum
  audit(data, actor, { entity: 'ReorderRule', recordId: productId, action: 'Updated', locationId, fields: 'Minimum' })
  return null
}

function expiring(data: DemoData, actor: Session) {
  return data.batches.filter(item => canAccess(actor, item.locationId) && freeQuantity(data, item) > 0 &&
    item.expiryDate <= demoDate(90)).sort((first, second) => first.expiryDate.localeCompare(second.expiryDate))
    .map(item => batchView(data, item))
}

function plans(data: DemoData, locationId: number) {
  return data.products.filter(product => !product.isDeleted).map(product => {
    const stock = data.batches.filter(batch => batch.productId === product.id)
    const local = stock.filter(batch => batch.locationId === locationId)
    const available = local.reduce((sum, batch) => sum + freeQuantity(data, batch), 0)
    const reserved = local.reduce((sum, batch) => sum + (batch.reservedQuantity ?? 0), 0)
    const transfers = data.transfers.filter(item => item.productId === product.id)
    const inbound = transfers.filter(item => item.toLocationId === locationId && ['InTransit', 'PartiallyReceived'].includes(item.status))
    const inTransit = inbound.flatMap(item => item.lines).reduce((sum, line) =>
      sum + line.shipped - line.accepted - line.damaged - line.missing, 0)
    const minimum = data.reorderRules[locationId + ':' + product.id] ?? product.minStock ?? 0
    const suggestedQuantity = Math.max(0, minimum - available - inTransit)
    const suggestedSourceId = suggestedQuantity ? locations.find(item => item.id !== locationId &&
      stock.filter(batch => batch.locationId === item.id).reduce((sum, batch) => sum + freeQuantity(data, batch), 0) -
        (data.reorderRules[item.id + ':' + product.id] ?? product.minStock ?? 0) >= suggestedQuantity)?.id : undefined
    return { productId: product.id, name: product.name, minimum, available, reserved, inTransit, suggestedQuantity, suggestedSourceId,
      approvedOutgoing: transfers.filter(item => item.fromLocationId === locationId && item.status === 'ReadyToShip')
        .reduce((sum, item) => sum + item.quantity, 0),
      suggestion: suggestedQuantity === 0 ? 'None' : suggestedSourceId ? 'Transfer' : 'Purchase' }
  })
}

function onLocalDate(value: string) {
  if (value.length === 10) return value
  const date = new Date(value)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-')
}

function reconcile(data: DemoData, actor: Session, params: URLSearchParams) {
  const from = params.get('from')
  const through = params.get('through')
  const locationId = Number(params.get('locationId'))
  requireDemo(from && through && from <= through, 'راجع الفترة المطلوبة.', 400)
  if (locationId) requireDemo(canAccess(actor, locationId), 'التقرير خارج نطاق الموقع.', 403)
  function includes(item: { locationId: number }, timestamp: string) {
    const date = onLocalDate(timestamp)
    return date >= from! && date <= through! && canAccess(actor, item.locationId) && (!locationId || item.locationId === locationId)
  }

  const sales = new Map<string, { locationId: number; paymentMethod: string; count: number; amount: number }>()
  const cash = new Map<string, { locationId: number; kind: string; count: number; amount: number }>()
  const stock = new Map<string, { kind: string; count: number; quantity: number }>()
  for (const sale of data.sales.filter(item => includes(item, item.createdAt))) {
    const paymentMethod = sale.paymentMethod ?? 'Cash'
    const key = sale.locationId + ':' + paymentMethod
    const row = sales.get(key) ?? { locationId: sale.locationId, paymentMethod, count: 0, amount: 0 }
    row.count++
    row.amount = roundMoney(row.amount + sale.totalAmount)
    sales.set(key, row)
  }
  for (const movement of data.movements.filter(item => includes(item, item.createdAt))) {
    const key = movement.locationId + ':' + movement.kind
    const row = cash.get(key) ?? { locationId: movement.locationId, kind: movement.kind, count: 0, amount: 0 }
    row.count++
    row.amount = roundMoney(row.amount + movement.amount)
    cash.set(key, row)
  }
  for (const movement of data.stockMovements.filter(item => includes(item, item.createdAt))) {
    const row = stock.get(movement.kind) ?? { kind: movement.kind, count: 0, quantity: 0 }
    row.count++
    row.quantity += movement.quantity
    stock.set(movement.kind, row)
  }
  return {
    sales: [...sales.values()], cash: [...cash.values()], stock: [...stock.values()],
    shifts: data.shifts.filter(item => item.closedAt && includes(item, item.closedAt)).map(item => ({
      ...item, difference: roundMoney((item.actualCash ?? 0) - (item.expectedCash ?? 0)),
    })),
  }
}
