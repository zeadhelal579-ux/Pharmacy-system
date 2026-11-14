// Looks up exposure by product and lot and applies an inventory hold.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from './api'
import type { Product } from './api'

type Trace = {
  recall?: { id: number; reason: string; openedAt: string } | null
  stock: { id: number; location: string; quantity: number; isQuarantined: boolean; expiryDate: string }[]
  sales: { id: number; saleId: number; locationId: number; quantity: number }[]
  transfers: { id: number; transferId: number; fromLocationId: number; toLocationId: number; shipped: number; accounted: number }[]
}

export function LotTrace({ token, canRecall }: { token: string; canRecall: boolean }) {
  const [products, setProducts] = useState<Product[]>()
  const [trace, setTrace] = useState<{ productId: number; lot: string; data: Trace }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    api<Product[]>('/products', token).then(items => { if (active) setProducts(items) },
      (failure: Error) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [token])

  async function lookup(productId: number, lot: string) {
    const query = new URLSearchParams({ productId: String(productId), lot })
    setTrace({ productId, lot, data: await api<Trace>('/inventory/lots/trace?' + query, token) })
  }
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'تعذر إتمام العملية') }
    finally { setBusy(false) }
  }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setTrace(undefined)
    void run(() => lookup(Number(fields.get('product')), String(fields.get('lot')).trim()))
  }
  function hold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trace) return
    const { productId, lot } = trace
    const reason = String(new FormData(event.currentTarget).get('reason')).trim()
    void run(async () => {
      const result = await api<{ changed: number }>('/inventory/lots/quarantine', token, { productId, lot, reason })
      setNotice('تم عزل سجلات الدفعة: ' + result.changed)
      await lookup(productId, lot)
    })
  }

  function recall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trace) return
    const { productId, lot, data } = trace
    const reason = String(new FormData(event.currentTarget).get('reason')).trim()
    void run(async () => {
      if (data.recall) {
        await api('/inventory/lots/recalls/' + data.recall.id + '/close', token, { reason })
        setNotice('تم إغلاق قرار السحب. الدفعات المعزولة تحتاج مراجعة وفك عزل.')
      } else {
        await api('/inventory/lots/recalls', token, { productId, lot, reason })
        setNotice('تم فتح قرار السحب')
      }
      await lookup(productId, lot)
    })
  }

  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">تتبّع الدفعات</h1>
    <form className="panel flex flex-wrap items-end gap-3" onSubmit={search}>
      <label>صنف الدفعة<select name="product" required><option value="">اختار الصنف</option>
        {products?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>رقم الدفعة المطلوب<input name="lot" required maxLength={80} /></label>
      <button className="primary" disabled={busy || !products}>تتبّع الدفعة</button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {trace && <>
      {(trace.data.recall || canRecall) && <section className="panel grid gap-2">
        <h2 className="font-bold">قرار سحب الدفعة</h2>
        {trace.data.recall && <p>قرار مفتوح · {trace.data.recall.reason}</p>}
        {canRecall && <form key={trace.data.recall?.id ?? 'open'} className="flex flex-wrap items-end gap-2" onSubmit={recall}>
          <label>{trace.data.recall ? 'سبب إغلاق قرار السحب' : 'سبب فتح قرار السحب'}<input name="reason" required maxLength={500} /></label>
          <button className="secondary" disabled={busy}>{trace.data.recall ? 'إغلاق قرار السحب' : 'فتح قرار السحب'}</button>
        </form>}
      </section>}
      <section className="panel grid gap-2"><h2 className="font-bold">أرصدة الدفعة {trace.lot}</h2>
        {trace.data.stock.length === 0 && <p>مفيش أرصدة للدفعة في المواقع المتاحة للحساب.</p>}
        <ul>{trace.data.stock.map(item => <li key={item.id}>
          {item.location} · {item.quantity} وحدة · {item.isQuarantined ? 'معزولة' : 'غير معزولة'}
        </li>)}</ul>
        {trace.data.stock.some(item => !item.isQuarantined) && <form className="flex flex-wrap items-end gap-3" onSubmit={hold}>
          <label>سبب عزل الدفعة<input name="reason" required maxLength={500} /></label>
          <button className="secondary" disabled={busy}>عزل الدفعة في المواقع المتاحة</button>
        </form>}
      </section>
      <section className="panel grid gap-2"><h2 className="font-bold">الفواتير المتأثرة</h2>
        {trace.data.sales.length === 0 && <p>لا توجد فواتير.</p>}
        <ul>{trace.data.sales.map(item => <li key={item.id}>
          <Link className="text-primary underline" to={'/receipts/' + item.saleId}>فاتورة {item.saleId}</Link> · موقع {item.locationId} · {item.quantity} وحدة
        </li>)}</ul>
      </section>
      <section className="panel grid gap-2"><h2 className="font-bold">التحويلات المتأثرة</h2>
        {trace.data.transfers.length === 0 && <p>لا توجد تحويلات.</p>}
        <ul>{trace.data.transfers.map(item => <li key={item.id}>تحويل {item.transferId} · من موقع {item.fromLocationId} إلى {item.toLocationId} ·
          مشحون {item.shipped} · قيد النقل {item.shipped - item.accounted}</li>)}</ul>
      </section>
    </>}
  </section>
}
