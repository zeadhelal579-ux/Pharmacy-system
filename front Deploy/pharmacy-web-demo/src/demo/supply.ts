// Simulates transfer reservations, shipments, supplier receipts and returns.
import type { Session } from '../api'
import { addBatch, audit, canAccess, find, freeQuantity, locationView, managers, now, permit, planStock,
  recordStock, replayOperation, requireDemo, roundMoney, stockOperators } from './domain'
import { demoDate } from './seed'
import type { DemoData, Order, PurchaseReceipt, Shipment, Transfer } from './seed'

type TransferInput = { fromLocationId: number; toLocationId: number; productId: number; quantity: number }
type ReceiveTransfer = { movementId: number; accepted: number; damaged: number; missing: number; note: string; operationId: string }
type OrderInput = { supplierId: number; locationId: number; lines: { productId: number; quantity: number; unitCost: number }[] }
type ReceivePurchase = { lineId: number; quantity: number; unitCost: number; batchNumber: string; expiryDate: string;
  invoiceNumber: string; operationId: string }

const remaining = (line: Shipment) => line.shipped - line.accepted - line.damaged - line.missing

export function transferRoutes(data: DemoData, actor: Session, route: string, method: string, body?: object) {
  const visible = (item: Pick<Transfer, 'fromLocationId' | 'toLocationId'>) =>
    canAccess(actor, item.fromLocationId) || canAccess(actor, item.toLocationId)
  if (route === '/transfers' && method === 'GET') {
    return data.transfers.filter(visible).toReversed().map(item => ({ ...item,
      product: find(data.products, item.productId), fromLocation: locationView(item.fromLocationId),
      toLocation: locationView(item.toLocationId) }))
  }
  if (route === '/transfers/request' && method === 'POST') {
    const input = body as TransferInput
    requireDemo(visible(input) && input.fromLocationId !== input.toLocationId, 'راجع مواقع التحويل.')
    locationView(input.fromLocationId)
    locationView(input.toLocationId)
    planStock(data, { locationId: input.fromLocationId, productId: input.productId, quantity: input.quantity })
    const transfer = { ...input, id: data.nextId++, requestedByUserId: actor.userId,
      status: 'Pending', reservations: [], lines: [] }
    data.transfers.push(transfer)
    auditTransfer(data, actor, transfer, 'Created')
    return { id: transfer.id }
  }
  const match = /^\/transfers\/(?:(approve|reject)\/(\d+)|(\d+)\/(ship|shipment|receive))$/.exec(route)
  if (!match) return undefined
  const transfer = find(data.transfers, Number(match[2] ?? match[3]))
  const action = match[1] ?? match[4]
  requireDemo(visible(transfer), 'التحويل خارج نطاق الموقع.', 403)
  if (action === 'shipment' && method === 'GET') return transfer.lines.map(line => ({ ...line, remaining: remaining(line) }))
  if (method !== 'POST') return undefined
  if (action === 'receive') {
    permit(actor, stockOperators, transfer.toLocationId)
    const input = body as ReceiveTransfer
    return replayOperation(data, 'transfer:' + transfer.id + ':' + input.operationId, input,
      () => receiveTransfer(data, actor, transfer, input))
  }
  permit(actor, stockOperators, transfer.fromLocationId)
  if (action === 'ship') {
    if (['InTransit', 'PartiallyReceived', 'Received'].includes(transfer.status)) return { id: transfer.id }
    shipTransfer(data, transfer)
  } else {
    requireDemo(actor.userId !== transfer.requestedByUserId, 'طلب التحويل يحتاج موافقة شخص آخر.', 403)
    decideTransfer(data, transfer, action)
  }
  auditTransfer(data, actor, transfer)
  return { id: transfer.id }
}

function auditTransfer(data: DemoData, actor: Session, transfer: Transfer, action = 'Updated', reason?: string) {
  audit(data, actor, { entity: 'TransferRequest', recordId: transfer.id, action, reason,
    locationId: transfer.fromLocationId, destinationId: transfer.toLocationId, fields: 'Status' })
}

function decideTransfer(data: DemoData, transfer: Transfer, action: string) {
  const status = action === 'approve' ? 'ReadyToShip' : 'Rejected'
  if (transfer.status === status) return
  requireDemo(transfer.status === 'Pending' || (action === 'reject' && transfer.status === 'ReadyToShip'),
    'حالة التحويل لا تسمح بهذا الإجراء.')
  if (action === 'approve') {
    const parts = planStock(data, { productId: transfer.productId, locationId: transfer.fromLocationId, quantity: transfer.quantity })
    transfer.reservations = parts.map(({ batch, quantity }) => {
      batch.reservedQuantity = (batch.reservedQuantity ?? 0) + quantity
      return { batchId: batch.id, quantity }
    })
  } else {
    for (const part of transfer.reservations) {
      const batch = find(data.batches, part.batchId)
      batch.reservedQuantity = (batch.reservedQuantity ?? 0) - part.quantity
    }
    transfer.reservations = []
  }
  transfer.status = status
}

function shipTransfer(data: DemoData, transfer: Transfer) {
  requireDemo(transfer.status === 'ReadyToShip', 'اعتمد التحويل قبل الشحن.')
  transfer.lines = transfer.reservations.map(({ batchId, quantity }) => {
    const batch = find(data.batches, batchId)
    batch.reservedQuantity = (batch.reservedQuantity ?? 0) - quantity
    requireDemo(freeQuantity(data, batch) >= quantity, 'راجع حالة الدفعات المحجوزة قبل الشحن.')
    batch.quantity -= quantity
    return { id: data.nextId++, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate, cost: batch.cost,
      isQuarantined: !!batch.isQuarantined, shipped: quantity, accepted: 0, damaged: 0, missing: 0 }
  })
  transfer.reservations = []
  transfer.status = 'InTransit'
  recordStock(data, transfer.fromLocationId, 'TransferDispatch', transfer.quantity)
}

function receiveTransfer(data: DemoData, actor: Session, transfer: Transfer, input: ReceiveTransfer) {
  requireDemo(['InTransit', 'PartiallyReceived'].includes(transfer.status), 'التحويل غير متاح للاستلام.')
  const line = find(transfer.lines, input.movementId)
  const { accepted, damaged, missing } = input
  const total = accepted + damaged + missing
  requireDemo([accepted, damaged, missing].every(value => Number.isSafeInteger(value) && value >= 0) &&
    total > 0 && total <= remaining(line), 'راجع الكميات المتبقية في الشحنة.')
  requireDemo(!missing || (actor.role !== 'WarehouseAdmin' && input.note.trim()), 'تسوية العجز تحتاج مديرًا وسببًا.')
  const batch = { productId: transfer.productId, locationId: transfer.toLocationId, batchNumber: line.batchNumber,
    expiryDate: line.expiryDate, cost: line.cost }
  if (accepted) addBatch(data, { ...batch, quantity: accepted, isQuarantined: line.isQuarantined })
  if (damaged) addBatch(data, { ...batch, quantity: damaged, isQuarantined: true })
  line.accepted += accepted
  line.damaged += damaged
  line.missing += missing
  transfer.status = transfer.lines.some(item => remaining(item) > 0) ? 'PartiallyReceived' : 'Received'
  if (accepted + damaged) recordStock(data, transfer.toLocationId, 'TransferReceive', accepted + damaged)
  auditTransfer(data, actor, transfer, 'Updated', input.note)
  return { id: transfer.id }
}

export function purchaseRoutes(data: DemoData, actor: Session, route: string, method: string, body?: object) {
  if (!/^\/(suppliers|purchase-orders|purchase-receipts)(\/|$)/.test(route)) return undefined
  permit(actor, stockOperators)
  if (route === '/suppliers') {
    if (method === 'GET') return data.suppliers
    const { name, contact } = body as { name: string; contact?: string }
    requireDemo(name.trim(), 'أدخل اسم المورد.', 400)
    const supplier = { id: data.nextId++, name: name.trim(), contact }
    data.suppliers.push(supplier)
    audit(data, actor, { entity: 'Supplier', recordId: supplier.id })
    return supplier
  }
  if (route === '/purchase-orders' && method === 'GET') {
    return data.orders.filter(order => canAccess(actor, order.locationId)).toReversed().map(order => ({
      ...order, supplierName: find(data.suppliers, order.supplierId).name,
      lines: order.lines.map(line => ({ ...line, productName: find(data.products, line.productId).name })),
    }))
  }
  if (route === '/purchase-orders' && method === 'POST') return createOrder(data, actor, body as OrderInput)

  const orderRoute = /^\/purchase-orders\/(\d+)\/(approve|receipts)$/.exec(route)
  if (orderRoute) {
    const order = find(data.orders, Number(orderRoute[1]))
    permit(actor, stockOperators, order.locationId)
    if (orderRoute[2] === 'approve' && method === 'POST') {
      permit(actor, managers)
      order.approvedAt ??= now()
      audit(data, actor, { entity: 'PurchaseOrder', recordId: order.id, action: 'Updated',
        fields: 'ApprovedAt', locationId: order.locationId })
      return { id: order.id }
    }
    if (orderRoute[2] !== 'receipts') return undefined
    if (method === 'GET') return data.purchaseReceipts.filter(item => item.orderId === order.id).map(item => receiptView(data, item))
    const input = body as ReceivePurchase
    return replayOperation(data, 'purchase:' + order.id + ':' + input.operationId, input,
      () => receivePurchase(data, actor, order, input))
  }
  const returned = /^\/purchase-receipts\/(\d+)\/returns$/.exec(route)
  if (!returned || method !== 'POST') return undefined
  const receipt = find(data.purchaseReceipts, Number(returned[1]))
  const batch = find(data.batches, receipt.batchId)
  permit(actor, stockOperators, batch.locationId)
  const input = body as { quantity: number; reason: string; operationId: string }
  return replayOperation(data, 'supplier-return:' + receipt.id + ':' + input.operationId, input, () => {
    requireDemo(Number.isSafeInteger(input.quantity) && input.quantity > 0 &&
      input.quantity <= receiptView(data, receipt).returnable && input.reason.trim(), 'راجع كمية مرتجع المورد والسبب.')
    batch.quantity -= input.quantity
    receipt.returned += input.quantity
    recordStock(data, batch.locationId, 'SupplierReturn', input.quantity)
    audit(data, actor, { entity: 'SupplierReturn', recordId: receipt.id, reason: input.reason, locationId: batch.locationId })
    return { expectedCredit: roundMoney(input.quantity * receipt.unitCost) }
  })
}

function createOrder(data: DemoData, actor: Session, input: OrderInput) {
  permit(actor, stockOperators, input.locationId)
  find(data.suppliers, input.supplierId)
  locationView(input.locationId)
  requireDemo(input.lines.length && new Set(input.lines.map(line => line.productId)).size === input.lines.length &&
    input.lines.every(line => Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.unitCost >= 0 &&
      !find(data.products, line.productId).isDeleted), 'راجع أصناف وكميات أمر الشراء.')
  const order = { ...input, id: data.nextId++, lines: input.lines.map(line => ({ ...line, id: data.nextId++, received: 0 })) }
  data.orders.push(order)
  audit(data, actor, { entity: 'PurchaseOrder', recordId: order.id, locationId: order.locationId })
  return { id: order.id }
}

function receivePurchase(data: DemoData, actor: Session, order: Order, input: ReceivePurchase) {
  const line = find(order.lines, input.lineId)
  requireDemo(order.approvedAt && Number.isSafeInteger(input.quantity) && input.quantity > 0 &&
    input.quantity <= line.quantity - line.received && input.unitCost >= 0 &&
    input.expiryDate >= demoDate() && input.batchNumber.trim() && input.invoiceNumber.trim(),
  'راجع اعتماد أمر الشراء والكمية وبيانات الدفعة.')
  const batch = addBatch(data, { productId: line.productId, locationId: order.locationId, quantity: input.quantity,
    expiryDate: input.expiryDate, batchNumber: input.batchNumber.trim(), cost: input.unitCost })
  const receipt = { id: data.nextId++, orderId: order.id, productId: line.productId, batchId: batch.id,
    quantity: input.quantity, unitCost: input.unitCost, invoiceNumber: input.invoiceNumber, returned: 0 }
  line.received += input.quantity
  data.purchaseReceipts.push(receipt)
  recordStock(data, order.locationId, 'PurchaseReceipt', input.quantity)
  audit(data, actor, { entity: 'PurchaseReceipt', recordId: receipt.id, locationId: order.locationId })
  return { remaining: line.quantity - line.received, unitCostDifference: roundMoney(input.unitCost - line.unitCost) }
}

function receiptView(data: DemoData, item: PurchaseReceipt) {
  const batch = find(data.batches, item.batchId)
  return { ...item, productName: find(data.products, item.productId).name, batchNumber: batch.batchNumber,
    returnable: Math.min(item.quantity - item.returned, batch.quantity - (batch.reservedQuantity ?? 0)) }
}
