// Requests, dispatches and receives inter-branch shipments.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from './api'
import type { Product, Session } from './api'

type Location = { id: number; name: string }
type Transfer = { id: number; requestedByUserId: number; fromLocationId: number; toLocationId: number; product: Product;
  fromLocation: Location; toLocation: Location; quantity: number; status: string }
type Shipment = { id: number; batchNumber?: string; shipped: number; accepted: number; damaged: number; missing: number; remaining: number }
const labels: Record<string, string> = { Pending: 'بانتظار الموافقة', ReadyToShip: 'جاهز للشحن',
  Rejected: 'مرفوض', InTransit: 'قيد النقل', PartiallyReceived: 'استلام جزئي', Received: 'تم الاستلام', Approved: 'تحويل سابق' }

export function Transfers({ token, session }: { token: string; session: Session }) {
  const [data, setData] = useState<{ transfers: Transfer[]; products: Product[]; locations: Location[] }>()
  const [shipment, setShipment] = useState<{ id: number; lines: Shipment[] }>()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef<{ payload: string; key: string } | null>(null)
  const manages = ['SuperAdmin', 'BranchManager', 'WarehouseAdmin'].includes(session.role)
  const allows = (id: number) => session.role === 'SuperAdmin' || id === session.locationId

  async function load() {
    const [transfers, products, locations] = await Promise.all([
      api<Transfer[]>('/transfers', token), api<Product[]>('/products', token), api<Location[]>('/locations', token),
    ])
    return { transfers, products, locations }
  }

  useEffect(() => {
    let active = true
    Promise.all([api<Transfer[]>('/transfers', token), api<Product[]>('/products', token), api<Location[]>('/locations', token)]).then(
      ([transfers, products, locations]) => { if (active) setData({ transfers, products, locations }) },
      (failure: Error) => { if (active) setError(failure.message) },
    )
    return () => { active = false }
  }, [token])

  async function act(action: () => Promise<void>, confirmation: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
      setMessage(confirmation)
      setData(await load())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر تنفيذ التحويل')
    } finally { setBusy(false) }
  }

  async function showShipment(id: number) {
    setShipment({ id, lines: await api<Shipment[]>('/transfers/' + id + '/shipment', token) })
  }

  function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    void act(async () => {
      await api('/transfers/request', token, {
        productId: Number(fields.get('product')), fromLocationId: Number(fields.get('source')),
        toLocationId: Number(fields.get('destination')), quantity: Number(fields.get('quantity')), batchId: 0,
      })
      form.reset()
    }, 'تم تسجيل طلب التحويل')
  }

  function receive(event: FormEvent<HTMLFormElement>, id: number, line: Shipment) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const body = { movementId: line.id, accepted: Number(fields.get('accepted')),
      damaged: Number(fields.get('damaged')), missing: Number(fields.get('missing')), note: String(fields.get('note')) }
    const payload = JSON.stringify({ id, ...body })
    if (pending.current?.payload !== payload) pending.current = { payload, key: crypto.randomUUID() }
    const operationId = pending.current.key
    void act(async () => {
      await api('/transfers/' + id + '/receive', token, { ...body, operationId })
      pending.current = null
      await showShipment(id)
    }, 'تم تسجيل الاستلام')
  }

  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">التحويلات</h1>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!data && !error && <p role="status">جاري التحميل…</p>}
    {data && <>
      <form className="panel grid gap-3" onSubmit={request}>
        <h2 className="font-bold">طلب تحويل جديد</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label>المصدر<select name="source" required><option value="">اختار المصدر</option>
            {data.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>الوجهة<select name="destination" required><option value="">اختار الوجهة</option>
            {data.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>صنف التحويل<select name="product" required><option value="">اختار الصنف</option>
            {data.products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>كمية التحويل<input name="quantity" min="1" max="1000000" type="number" required /></label>
        </div>
        <button className="primary w-fit" disabled={busy}>إرسال طلب التحويل</button>
      </form>
      {data.transfers.map(item => <article key={item.id} className="panel grid gap-3">
        <h2 className="font-bold">#{item.id} · {item.product.name} · {labels[item.status] ?? item.status}</h2>
        <p>{item.fromLocation.name} ← {item.toLocation.name} · الكمية {item.quantity}</p>
        <div className="flex flex-wrap gap-2">
          {manages && allows(item.fromLocationId) && item.requestedByUserId !== session.userId && item.status === 'Pending' && <>
            <button className="secondary" disabled={busy} onClick={() => act(async () => { await api('/transfers/approve/' + item.id, token, {}) }, 'تم اعتماد التحويل')}>اعتماد</button>
            <button className="secondary" disabled={busy} onClick={() => act(async () => { await api('/transfers/reject/' + item.id, token, {}) }, 'تم رفض التحويل')}>رفض</button>
          </>}
          {manages && allows(item.fromLocationId) && item.status === 'ReadyToShip' &&
            <>
              <button className="primary" disabled={busy} onClick={() => act(async () => { await api('/transfers/' + item.id + '/ship', token, {}) }, 'تم تسجيل الشحن')}>شحن التحويل</button>
              {item.requestedByUserId !== session.userId &&
                <button className="secondary" disabled={busy} onClick={() => act(async () => { await api('/transfers/reject/' + item.id, token, {}) }, 'تم إلغاء التحويل وفك الحجز')}>إلغاء التحويل وفك الحجز</button>}
            </>}
          {['InTransit', 'PartiallyReceived', 'Received'].includes(item.status) &&
            <button className="secondary" disabled={busy} onClick={() => act(() => showShipment(item.id), 'تم تحميل الدفعات')}>دفعات الشحنة</button>}
        </div>
        {shipment?.id === item.id && shipment.lines.map(line => <div key={line.id} className="grid gap-2 border-t border-emerald-900/10 pt-3">
          <p>دفعة {line.batchNumber ?? line.id} · مشحون {line.shipped} · صالح {line.accepted} · تالف {line.damaged} · عجز مسوّى {line.missing} · متبقي {line.remaining}</p>
          {line.remaining > 0 && manages && allows(item.toLocationId) &&
            <form key={line.remaining} className="flex flex-wrap items-end gap-2" onSubmit={event => receive(event, item.id, line)}>
              <label>الكمية الصالحة<input name="accepted" type="number" min="0" max={line.remaining} defaultValue={0} required /></label>
              <label>الكمية التالفة<input name="damaged" type="number" min="0" max={line.remaining} defaultValue={0} required /></label>
              {session.role !== 'WarehouseAdmin' &&
                <label>عجز نهائي<input name="missing" type="number" min="0" max={line.remaining} defaultValue={0} required /></label>}
              <label>ملاحظة الاستلام<input name="note" maxLength={500} /></label>
              <button className="primary" disabled={busy}>تسجيل استلام التحويل</button>
            </form>}
        </div>)}
      </article>)}
    </>}
  </section>
}
