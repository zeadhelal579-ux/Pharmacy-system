// Shows replenishment recommendations and location-specific reorder thresholds.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from './api'
import type { Session } from './api'

type Plan = { productId: number; name: string; minimum: number; available: number; inTransit: number;
  approvedOutgoing: number; reserved: number; suggestedQuantity: number; suggestedSourceId?: number; suggestion: 'None' | 'Transfer' | 'Purchase' }

export function Replenishment({ token, session }: { token: string; session: Session }) {
  const [location, setLocation] = useState(session.locationId)
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([])
  const [data, setData] = useState<Plan[]>()
  const [editing, setEditing] = useState<Plan>()
  const [onlyShortages, setOnlyShortages] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    api<typeof locations>('/locations', token).then(items => { if (active) setLocations(items) },
      (failure: Error) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [token])
  useEffect(() => {
    let active = true
    api<Plan[]>('/reports/replenishment/' + location, token).then(items => { if (active) setData(items) },
      (failure: Error) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [token, location, revision])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || busy) return
    const minimum = Number(new FormData(event.currentTarget).get('minimum'))
    setBusy(true)
    setError('')
    try {
      await api('/reports/replenishment/' + location + '/' + editing.productId, token, { minimum }, undefined, 'PUT')
      setEditing(undefined)
      setRevision(value => value + 1)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'تعذر حفظ الحد') }
    finally { setBusy(false) }
  }

  const rows = data?.filter(row => !onlyShortages || row.suggestedQuantity > 0)
  const locationLabel = (id?: number) => locations.find(item => item.id === id)?.name ?? id
  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">إعادة الطلب</h1>
    <div className="panel flex flex-wrap items-end gap-4">
      {session.role === 'SuperAdmin' && <label>موقع إعادة الطلب<select value={location} disabled={busy} onChange={event => {
        setLocation(Number(event.target.value)); setData(undefined); setEditing(undefined); setError('')
      }}>{locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label className="flex items-center gap-2"><input className="w-5" type="checkbox" checked={onlyShortages}
        onChange={event => setOnlyShortages(event.target.checked)} />عرض الأصناف اللي تحتاج توريد فقط</label>
      <button className="secondary" onClick={() => { setError(''); setRevision(value => value + 1) }}>تحديث الرصيد</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {editing && <form className="panel flex flex-wrap items-end gap-3" onSubmit={save}>
      <label>حد إعادة الطلب للصنف {editing.name}<input name="minimum" type="number" min="0" max="1000000"
        defaultValue={editing.minimum} required /></label>
      <button className="primary" disabled={busy}>حفظ الحد</button>
      <button className="secondary" type="button" disabled={busy} onClick={() => setEditing(undefined)}>إلغاء</button>
    </form>}
    {data && rows?.length === 0 && <p role="status">لا توجد نواقص حسب الاختيار الحالي.</p>}
    {!!rows?.length && <div className="panel overflow-auto"><table className="w-full">
      <thead><tr>{['الصنف', 'الحد', 'متاح للبيع', 'محجوز', 'صادر معتمد بدون حجز', 'وارد قيد النقل', 'الاقتراح'].map(label =>
        <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map(item => <tr key={item.productId}>
        <td>{item.name}</td><td>{item.minimum} {session.role !== 'WarehouseAdmin' &&
          <button className="secondary" disabled={busy} onClick={() => setEditing(item)}>تعديل حد {item.name}</button>}</td>
        <td>{item.available}</td><td>{item.reserved}</td><td>{item.approvedOutgoing}</td><td>{item.inTransit}</td>
        <td>{item.suggestion === 'Transfer' ? 'اقتراح تحويل ' + item.suggestedQuantity + ' من ' + locationLabel(item.suggestedSourceId)
          : item.suggestion === 'Purchase' ? 'اقتراح شراء ' + item.suggestedQuantity : '—'}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>
}
