// Records physical counts and submits pending differences for approval.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from './api'
import type { Batch, Session } from './api'

type Count = { id: number; batchNumber?: string; productName: string; baseline: number; counted: number; reason: string; approvedAt?: string }

async function load(token: string, locationId: number) {
  const [batches, counts] = await Promise.all([
    api<Batch[]>('/inventory/location/' + locationId + '?includeEmpty=true', token),
    api<Count[]>('/stock-counts', token),
  ])
  return { batches, counts }
}

export function StockCounts({ token, session }: { token: string; session: Session }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof load>>>()
  const [batchId, setBatchId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const batch = data?.batches.find(item => String(item.id) === batchId)
  const locationId = session.locationId

  useEffect(() => {
    let active = true
    load(token, locationId).then(
      result => { if (active) setData(result) },
      (failure: Error) => { if (active) setError(failure.message) },
    )
    return () => { active = false }
  }, [token, locationId])

  async function act(path: string, body: object, confirmation: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api(path, token, body)
      setMessage(confirmation)
      setBatchId('')
      setData(await load(token, locationId))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر حفظ الجرد')
    } finally { setBusy(false) }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!batch) return
    const fields = new FormData(event.currentTarget)
    void act('/stock-counts', {
      batchId: batch.id, expectedQuantity: batch.quantity,
      counted: Number(fields.get('counted')), reason: String(fields.get('reason')),
    }, 'تم تسجيل العد للمراجعة')
  }

  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">الجرد والتسويات</h1>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!data && !error && <p role="status">جاري التحميل…</p>}
    {data && <>
      <form className="panel grid gap-3" onSubmit={submit}>
        <label>دفعة الجرد<select value={batchId} onChange={event => setBatchId(event.target.value)} required>
          <option value="">اختار الدفعة</option>
          {data.batches.map(item => <option key={item.id} value={item.id}>{item.product.name} · {item.batchNumber ?? item.id}</option>)}
        </select></label>
        {batch && <div key={batch.id} className="grid gap-3">
          <p>الرصيد المسجل عند تحميل الدفعة {batch.quantity}</p>
          <label>الكمية الفعلية<input name="counted" type="number" min="0" max="2147483647" required /></label>
          <label>سبب الجرد<input name="reason" maxLength={500} required /></label>
        </div>}
        <div className="flex gap-2">
          <button className="primary" disabled={busy || !batch}>تسجيل العد</button>
          <button className="secondary" type="button" disabled={busy} onClick={() => {
            setBusy(true)
            load(token, locationId).then(result => { setData(result); setBatchId(''); setError('') },
              (failure: Error) => setError(failure.message)).finally(() => setBusy(false))
          }}>تحديث الأرصدة</button>
        </div>
      </form>
      {data.counts.map(count => <article className="panel grid gap-2" key={count.id}>
        <h2 className="font-bold">{count.productName} · دفعة {count.batchNumber ?? count.id}</h2>
        <p>مسجل {count.baseline} · فعلي {count.counted} · فرق {count.counted - count.baseline}</p>
        <p>{count.reason} · {count.approvedAt ? 'معتمد' : 'بانتظار الاعتماد'}</p>
        {!count.approvedAt && session.role !== 'WarehouseAdmin' &&
          <button className="secondary w-fit" disabled={busy} onClick={() =>
            act('/stock-counts/' + count.id + '/approve', {}, 'تم اعتماد التسوية')}>اعتماد التسوية</button>}
      </article>)}
    </>}
  </section>
}
