// Reviews and decides discount requests for the manager's location.
import { useEffect, useState } from 'react'
import { api, money } from './api'

type Approval = { id: number; userId: number; locationId: number; amount: number; reason: string; approved: boolean | null; used: boolean }

export function Discounts({ token, userId }: { token: string; userId: number }) {
  const [rows, setRows] = useState<Approval[]>()
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    api<Approval[]>('/discounts', token).then(result => { if (active) setRows(result) },
      (failure: Error) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [token, revision])
  async function decide(id: number, approved: boolean) {
    setBusy(true)
    setError('')
    try {
      await api('/discounts/' + id + '/decision', token, { approved })
      setRevision(value => value + 1)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'تعذر تسجيل القرار') }
    finally { setBusy(false) }
  }
  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">اعتماد الخصومات</h1>
    <button className="secondary w-fit" onClick={() => setRevision(value => value + 1)}>تحديث الطلبات</button>
    {error && <p role="alert" className="error">{error}</p>}
    {rows?.length === 0 && <p>لا توجد طلبات خصم.</p>}
    {rows?.map(item => <article key={item.id} className="panel grid gap-2">
      <h2 className="font-bold">طلب #{item.id} · {money.format(item.amount)}</h2>
      <p>مستخدم {item.userId} · موقع {item.locationId} · {item.reason}</p>
      <p>{item.used ? 'مستخدم في فاتورة' : item.approved === null ? 'بانتظار القرار' : item.approved ? 'معتمد' : 'مرفوض'}</p>
      {item.approved === null && item.userId !== userId && <div className="flex gap-2">
        <button className="primary" disabled={busy} onClick={() => decide(item.id, true)}>اعتماد الخصم</button>
        <button className="secondary" disabled={busy} onClick={() => decide(item.id, false)}>رفض الخصم</button>
      </div>}
    </article>)}
  </section>
}
