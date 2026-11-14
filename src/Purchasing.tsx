// Manages supplier orders and receives individual lots against outstanding lines.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, money } from './api'
import type { Product, Session } from './api'

type Option = { id: number; name: string }
type OrderLine = { id: number; productName: string; quantity: number; received: number; unitCost: number }
type Order = { id: number; supplierName: string; locationId: number; approvedAt?: string; lines: OrderLine[] }
type Data = { suppliers: Option[]; products: Product[]; locations: Option[]; orders: Order[] }
type Receipt = { id: number; productName: string; batchNumber?: string; invoiceNumber: string; returnable: number; returned: number }

async function load(token: string): Promise<Data> {
  const [suppliers, products, locations, orders] = await Promise.all([
    api<Option[]>('/suppliers', token), api<Product[]>('/products', token),
    api<Option[]>('/locations', token), api<Order[]>('/purchase-orders', token),
  ])
  return { suppliers, products, locations, orders }
}

export function Purchasing({ token, session }: { token: string; session: Session }) {
  const [data, setData] = useState<Data>()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState([0])
  const nextRow = useRef(1)
  const pendingReceipt = useRef<{ payload: string; operationId: string } | null>(null)
  const [receipt, setReceipt] = useState<{ order: Order; line: OrderLine }>()
  const [receipts, setReceipts] = useState<{ orderId: number; items: Receipt[] }>()
  const pendingReturn = useRef<{ payload: string; operationId: string } | null>(null)

  useEffect(() => {
    let active = true
    load(token).then(
      result => { if (active) setData(result) },
      (failure: Error) => { if (active) setError(failure.message) },
    )
    return () => { active = false }
  }, [token])

  async function submit(event: FormEvent<HTMLFormElement>, action: (fields: FormData) => Promise<string>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await action(new FormData(form))
      form.reset()
      setMessage(result)
      setData(await load(token))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر تنفيذ الطلب')
    } finally { setBusy(false) }
  }

  async function receive(fields: FormData) {
    if (!receipt) throw new Error('اختار بند الاستلام')
    const body = {
      lineId: receipt.line.id, quantity: Number(fields.get('quantity')),
      unitCost: Number(fields.get('unitCost')), batchNumber: String(fields.get('batchNumber')),
      expiryDate: String(fields.get('expiryDate')), invoiceNumber: String(fields.get('invoiceNumber')),
    }
    const payload = JSON.stringify(body)
    if (pendingReceipt.current?.payload !== payload) pendingReceipt.current = { payload, operationId: crypto.randomUUID() }
    const result = await api<{ remaining: number; unitCostDifference: number }>(
      '/purchase-orders/' + receipt.order.id + '/receipts', token,
      { ...body, operationId: pendingReceipt.current.operationId },
    )
    pendingReceipt.current = null
    setReceipt(undefined)
    return 'تم تسجيل الاستلام. المتبقي ' + result.remaining + ' · فرق سعر الوحدة ' + money.format(result.unitCostDifference)
  }

  async function showReceipts(orderId: number) {
    setReceipts({ orderId, items: await api<Receipt[]>('/purchase-orders/' + orderId + '/receipts', token) })
  }

  async function recordReturn(orderId: number, item: Receipt, fields: FormData) {
    const body = { quantity: Number(fields.get('returnQuantity')), reason: String(fields.get('returnReason')) }
    const payload = JSON.stringify({ receiptId: item.id, ...body })
    if (pendingReturn.current?.payload !== payload) pendingReturn.current = { payload, operationId: crypto.randomUUID() }
    const result = await api<{ expectedCredit: number }>('/purchase-receipts/' + item.id + '/returns', token,
      { ...body, operationId: pendingReturn.current.operationId })
    pendingReturn.current = null
    await showReceipts(orderId)
    return 'تم تسجيل مرتجع المورد. القيمة المتوقعة ' + money.format(result.expectedCredit)
  }

  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">المشتريات والموردون</h1>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="panel" role="status">{message}</p>}
    {!data && !error && <p role="status">جاري التحميل…</p>}
    {data && <>
      <form className="panel grid gap-3" onSubmit={event => submit(event, async fields => {
        await api('/suppliers', token, Object.fromEntries(fields))
        return 'تم تسجيل المورد'
      })}>
        <h2 className="font-bold">إضافة مورد</h2>
        <label>اسم المورد<input name="name" maxLength={150} required /></label>
        <label>بيانات الاتصال<input name="contact" maxLength={150} /></label>
        <button className="secondary w-fit" disabled={busy}>حفظ المورد</button>
      </form>
      <form className="panel grid gap-3" onSubmit={event => submit(event, async fields => {
        await api('/purchase-orders', token, {
          supplierId: Number(fields.get('supplier')),
          locationId: Number(fields.get('location') ?? session.locationId),
          lines: rows.map(row => ({
            productId: Number(fields.get('product-' + row)),
            quantity: Number(fields.get('quantity-' + row)),
            unitCost: Number(fields.get('cost-' + row)),
          })),
        })
        setRows([0])
        return 'تم إنشاء أمر الشراء'
      })}>
        <h2 className="font-bold">أمر شراء جديد</h2>
        <label>المورد<select name="supplier" required><option value="">اختار مورد</option>
          {data.suppliers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {session.role === 'SuperAdmin' && <label>موقع الاستلام<select name="location" defaultValue={session.locationId}>
          {data.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>}
        {rows.map((row, index) => <fieldset key={row} className="grid gap-2 md:grid-cols-3">
          <legend>بند {index + 1}</legend>
          <label>الصنف<select name={'product-' + row} required><option value="">اختار صنف</option>
            {data.products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>الكمية<input name={'quantity-' + row} type="number" min="1" max="1000000" required /></label>
          <label>تكلفة الوحدة المتفق عليها<input name={'cost-' + row} type="number" step="0.01" min="0" max="1000000" required /></label>
          {index > 0 && <button type="button" className="secondary w-fit"
            onClick={() => setRows(previous => previous.filter(item => item !== row))}>حذف البند {index + 1}</button>}
        </fieldset>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="secondary" disabled={busy || rows.length >= 100}
            onClick={() => { const row = nextRow.current++; setRows(previous => [...previous, row]) }}>إضافة بند</button>
          <button className="primary" disabled={busy || !data.suppliers.length || !data.products.length}>إنشاء أمر الشراء</button>
        </div>
      </form>
      {receipt && <form key={receipt.line.id} className="panel grid gap-3" onSubmit={event => submit(event, receive)}>
        <h2 className="font-bold">استلام {receipt.line.productName} · أمر #{receipt.order.id}</h2>
        <label>الكمية المستلمة<input name="quantity" type="number" min="1" max={receipt.line.quantity - receipt.line.received} required /></label>
        <label>التكلفة الفعلية للوحدة<input name="unitCost" type="number" step="0.01" min="0" max="1000000" defaultValue={receipt.line.unitCost} required /></label>
        <label>رقم الدفعة<input name="batchNumber" maxLength={80} required /></label>
        <label>تاريخ انتهاء الدفعة<input name="expiryDate" type="date" required /></label>
        <label>رقم فاتورة المورد<input name="invoiceNumber" maxLength={80} required /></label>
        <button className="primary w-fit" disabled={busy}>تسجيل الاستلام</button>
      </form>}
      <h2 className="text-lg font-bold">أوامر الشراء</h2>
      {!data.orders.length && <p className="panel">لا توجد أوامر شراء.</p>}
      {data.orders.map(order => <article key={order.id} className="panel grid gap-2">
        <h3 className="font-bold">أمر #{order.id} · {order.supplierName} · موقع {order.locationId}</h3>
        {!order.approvedAt && (session.role === 'WarehouseAdmin' ? <p>بانتظار الاعتماد</p> :
          <form onSubmit={event => submit(event, async () => {
            await api('/purchase-orders/' + order.id + '/approve', token, {})
            return 'تم اعتماد أمر الشراء'
          })}><button className="secondary" disabled={busy}>اعتماد أمر الشراء</button></form>)}
        {order.lines.map(line => <div key={line.id} className="flex flex-wrap items-center justify-between gap-2">
          <p>{line.productName} · المطلوب {line.quantity} · المستلم {line.received} · المتبقي {line.quantity - line.received}</p>
          <button className="secondary" disabled={busy || !order.approvedAt || line.received === line.quantity}
            onClick={() => setReceipt({ order, line })}>استلام دفعة</button>
        </div>)}
        {order.lines.some(line => line.received > 0) &&
          <form onSubmit={event => submit(event, async () => {
            await showReceipts(order.id)
            return 'تم تحميل دفعات الاستلام'
          })}><button className="secondary w-fit" disabled={busy}>دفعات الاستلام والمرتجعات</button></form>}
        {receipts?.orderId === order.id && receipts.items.map(item => <div key={item.id} className="grid gap-2 border-t border-emerald-900/10 pt-3">
          <p>{item.productName} · دفعة {item.batchNumber ?? '—'} · فاتورة {item.invoiceNumber}</p>
          <p>تم إرجاع {item.returned} · متاح للرد {item.returnable}</p>
          {item.returnable > 0 && <form className="flex flex-wrap items-end gap-2" onSubmit={event =>
            submit(event, fields => recordReturn(order.id, item, fields))}>
            <label>كمية مرتجع المورد<input name="returnQuantity" type="number" min="1" max={item.returnable} required /></label>
            <label>سبب مرتجع المورد<input name="returnReason" maxLength={500} required /></label>
            <button className="secondary" disabled={busy}>تسجيل مرتجع المورد</button>
          </form>}
        </div>)}
      </article>)}
    </>}
  </section>
}
