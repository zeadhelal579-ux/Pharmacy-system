// Simulates inventory reads, batch holds, recall decisions and physical counts.
import type { Session } from '../api'
import { addBatch, audit, batchView, canAccess, find, isRecalled, locationView, managers, now, permit,
  recordStock, requireDemo, stockOperators } from './domain'
import { demoDate } from './seed'
import type { DemoBatch, DemoData } from './seed'

type OpeningRow = { name: string; barcode: string; batchNumber: string; expiryDate: string | null;
  quantity: number; sellPrice: number }
type HoldInput = { productId: number; lot: string; reason: string }

export function inventoryRoutes(data: DemoData, actor: Session, url: URL, method: string, body?: object) {
  const route = url.pathname
  const location = /^\/inventory\/location\/(\d+)$/.exec(route)
  if (location && method === 'GET') {
    const locationId = Number(location[1])
    requireDemo(canAccess(actor, locationId), 'المخزون خارج نطاق الموقع.', 403)
    return data.batches.filter(batch => batch.locationId === locationId &&
      (batch.quantity > 0 || url.searchParams.get('includeEmpty') === 'true')).map(batch => batchView(data, batch))
  }
  const status = /^\/inventory\/batches\/(\d+)\/status$/.exec(route)
  if (status) {
    const batch = find(data.batches, Number(status[1]))
    permit(actor, stockOperators, batch.locationId)
    if (method === 'GET') return data.batchDecisions.filter(item => item.batchId === batch.id).toReversed()
    const input = body as { isQuarantined: boolean; reason: string }
    if (!input.isQuarantined) {
      permit(actor, managers)
      requireDemo(!isRecalled(data, batch) && batch.quantity > 0 && batch.expiryDate >= demoDate() &&
        !find(data.products, batch.productId).isDeleted, 'الدفعة غير مؤهلة لفك العزل.')
    }
    changeStatus(data, actor, batch, input)
    return { isQuarantined: batch.isQuarantined }
  }
  if (route.startsWith('/inventory/lots/')) return lotRoutes(data, actor, url, method, body)
  if (route.startsWith('/stock-counts')) return countRoutes(data, actor, route, method, body)
  if (method === 'POST' && (route === '/opening-stock/preview' || route === '/opening-stock/apply')) {
    return importStock(data, actor, route, body as { locationId: number; rows: OpeningRow[] })
  }
  return undefined
}

function changeStatus(data: DemoData, actor: Session, batch: DemoBatch, input: { isQuarantined: boolean; reason: string }) {
  requireDemo(input.reason.trim(), 'سجل سبب تغيير الحالة.', 400)
  if (!!batch.isQuarantined === input.isQuarantined) return
  batch.isQuarantined = input.isQuarantined
  const decision = { id: data.nextId++, batchId: batch.id, userId: actor.userId, quarantined: input.isQuarantined,
    reason: input.reason.trim(), createdAt: now() }
  data.batchDecisions.push(decision)
  audit(data, actor, { entity: 'BatchStatusChange', recordId: batch.id, locationId: batch.locationId,
    reason: decision.reason, fields: 'IsQuarantined' })
}

function lotRoutes(data: DemoData, actor: Session, url: URL, method: string, body?: object) {
  permit(actor, stockOperators)
  const route = url.pathname
  if (route === '/inventory/lots/trace' && method === 'GET') {
    const productId = Number(url.searchParams.get('productId'))
    const lot = url.searchParams.get('lot')?.trim()
    return traceLot(data, actor, { productId, lot: lot ?? '' })
  }
  if (method !== 'POST') return undefined
  const close = /^\/inventory\/lots\/recalls\/(\d+)\/close$/.exec(route)
  if (close) {
    permit(actor, ['SuperAdmin'])
    const recall = find(data.recalls, Number(close[1]))
    const { reason } = body as { reason: string }
    requireDemo(reason.trim() && !recall.closedAt, 'راجع حالة قرار السحب والسبب.')
    recall.closedAt = now()
    audit(data, actor, { entity: 'LotRecall', recordId: recall.id, action: 'Updated', reason, fields: 'ClosedAt' })
    return { id: recall.id }
  }
  const input = body as HoldInput
  const { productId, lot, reason } = input
  requireDemo(lot.trim() && reason.trim(), 'أدخل رقم الدفعة والسبب.', 400)
  find(data.products, productId)
  if (route === '/inventory/lots/recalls') {
    permit(actor, ['SuperAdmin'])
    requireDemo(!data.recalls.some(item => !item.closedAt && item.productId === productId && item.lot === lot.trim()),
      'يوجد قرار سحب مفتوح للدفعة.')
    const recall = { id: data.nextId++, productId, lot: lot.trim(), reason, openedAt: now() }
    data.recalls.push(recall)
    audit(data, actor, { entity: 'LotRecall', recordId: recall.id, reason })
    quarantineLot(data, actor, input)
    return { id: recall.id }
  }
  if (route === '/inventory/lots/quarantine') return { changed: quarantineLot(data, actor, input) }
  return undefined
}

function quarantineLot(data: DemoData, actor: Session, input: HoldInput) {
  const eligible = data.batches.filter(batch => batch.productId === input.productId && batch.batchNumber === input.lot.trim() &&
    !batch.isQuarantined && batch.quantity > 0 && canAccess(actor, batch.locationId))
  for (const batch of eligible) changeStatus(data, actor, batch, { isQuarantined: true, reason: input.reason })
  return eligible.length
}

function traceLot(data: DemoData, actor: Session, search: { productId: number; lot: string }) {
  const matched = data.batches.filter(batch => batch.productId === search.productId && batch.batchNumber === search.lot)
  const batchIds = new Set(matched.map(batch => batch.id))
  return {
    recall: data.recalls.find(item => !item.closedAt && item.productId === search.productId && item.lot === search.lot),
    stock: matched.filter(batch => canAccess(actor, batch.locationId)).map(batch => ({
      ...batch, location: locationView(batch.locationId).name,
    })),
    sales: data.sales.filter(sale => canAccess(actor, sale.locationId)).flatMap(sale =>
      sale.saleItems.filter(line => batchIds.has(line.batchId))
        .map(line => ({ id: line.id, saleId: sale.id, locationId: sale.locationId, quantity: line.quantity }))),
    transfers: data.transfers.filter(item => item.productId === search.productId &&
      (canAccess(actor, item.fromLocationId) || canAccess(actor, item.toLocationId))).flatMap(item =>
      item.lines.filter(line => line.batchNumber === search.lot).map(line => ({
        id: line.id, transferId: item.id, fromLocationId: item.fromLocationId, toLocationId: item.toLocationId,
        shipped: line.shipped, accounted: line.accepted + line.damaged + line.missing,
      }))),
  }
}

function countRoutes(data: DemoData, actor: Session, route: string, method: string, body?: object) {
  permit(actor, stockOperators)
  if (route === '/stock-counts' && method === 'GET') {
    return data.counts.toReversed().flatMap(item => {
      const batch = find(data.batches, item.batchId)
      return canAccess(actor, batch.locationId) ?
        [{ ...item, batchNumber: batch.batchNumber, productName: find(data.products, batch.productId).name }] : []
    })
  }
  if (route === '/stock-counts' && method === 'POST') {
    const input = body as { batchId: number; expectedQuantity: number; counted: number; reason: string }
    const batch = find(data.batches, input.batchId)
    permit(actor, stockOperators, batch.locationId)
    requireDemo(input.expectedQuantity === batch.quantity &&
      !data.counts.some(item => item.batchId === batch.id && !item.approvedAt), 'راجع الرصيد أو الجرد المعلّق لهذه الدفعة.')
    requireDemo(Number.isSafeInteger(input.counted) && input.counted >= 0 && input.reason.trim(), 'راجع الكمية والسبب.', 400)
    const count = { id: data.nextId++, batchId: batch.id, baseline: batch.quantity, counted: input.counted, reason: input.reason }
    data.counts.push(count)
    audit(data, actor, { entity: 'StockCount', recordId: count.id, reason: count.reason, locationId: batch.locationId })
    return { id: count.id }
  }
  const approve = /^\/stock-counts\/(\d+)\/approve$/.exec(route)
  if (!approve || method !== 'POST') return undefined
  const count = find(data.counts, Number(approve[1]))
  const batch = find(data.batches, count.batchId)
  permit(actor, managers, batch.locationId)
  if (count.approvedAt) return { id: count.id }
  const difference = count.counted - count.baseline
  requireDemo(batch.quantity + difference >= (batch.reservedQuantity ?? 0), 'فرق العد أكبر من الرصيد الحر للدفعة.')
  batch.quantity += difference
  count.approvedAt = now()
  recordStock(data, batch.locationId, 'StockCount', difference)
  audit(data, actor, { entity: 'StockCount', recordId: count.id, action: 'Updated',
    locationId: batch.locationId, reason: count.reason, fields: 'ApprovedAt, Quantity' })
  return { id: count.id }
}

function importStock(data: DemoData, actor: Session, route: string, input: { locationId: number; rows: OpeningRow[] }) {
  permit(actor, managers, input.locationId)
  locationView(input.locationId)
  requireDemo(input.rows.length >= 1 && input.rows.length <= 500, 'الملف لازم يحتوي على 1 إلى 500 صف.', 400)
  const fingerprint = JSON.stringify(input)
  const alreadyApplied = data.imports.includes(fingerprint)
  const errors: { row: number; message: string }[] = []
  const seen = new Set<string>()
  input.rows.forEach((item, index) => {
    const key = JSON.stringify([item.barcode, item.batchNumber])
    const duplicate = seen.has(key) || data.batches.some(batch => batch.locationId === input.locationId &&
      batch.batchNumber === item.batchNumber && find(data.products, batch.productId).barcode === item.barcode)
    const valid = item.name.trim() && item.barcode.trim() && item.batchNumber.trim() && item.expiryDate &&
      item.expiryDate >= demoDate() && Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.sellPrice >= 0
    const archived = data.products.some(product => product.barcode === item.barcode && product.isDeleted)
    if (duplicate || !valid || archived) errors.push({ row: index + 1, message: duplicate ? 'الدفعة مكررة.' :
      archived ? 'الباركود مرتبط بصنف مؤرشف.' : 'راجع بيانات الصنف والصلاحية والكمية.' })
    seen.add(key)
  })
  const review = { errors: alreadyApplied ? [] : errors, rowCount: input.rows.length, alreadyApplied }
  if (route.endsWith('/preview') || alreadyApplied || errors.length) return review
  for (const item of input.rows) {
    let product = data.products.find(row => row.barcode === item.barcode)
    if (!product) {
      product = { id: data.nextId++, name: item.name, barcode: item.barcode, sellPrice: item.sellPrice, unit: 'قطعة', minStock: 10 }
      data.products.push(product)
    }
    addBatch(data, { productId: product.id, locationId: input.locationId, batchNumber: item.batchNumber,
      expiryDate: item.expiryDate!, quantity: item.quantity, cost: product.buyPrice ?? 0 })
    recordStock(data, input.locationId, 'OpeningStock', item.quantity)
  }
  data.imports.push(fingerprint)
  audit(data, actor, { entity: 'OpeningImport', recordId: data.nextId++, locationId: input.locationId })
  return review
}
