// Lists committed operational changes with location filtering and cursor navigation.
import { useEffect, useState } from 'react'
import { api } from './api'

type Event = { id: number; userId: number; locationId?: number; destinationId?: number;
  occurredAt: string; entity: string; action: string; recordId?: number; reason?: string; fields: string }
const actions: Record<string, string> = { Created: 'إنشاء', Updated: 'تعديل', Archived: 'أرشفة' }
const entities: Record<string, string> = {
  User: 'مستخدم', Product: 'صنف', Supplier: 'مورد', Sale: 'بيع', PurchaseReceipt: 'استلام شراء',
  SupplierReturn: 'مرتجع مورد', CashShift: 'شيفت', ShiftMovement: 'حركة خزنة', BatchStatusChange: 'حالة دفعة',
  LotRecall: 'سحب دفعة', PurchaseOrder: 'أمر شراء', TransferRequest: 'طلب تحويل',
  TransferReceipt: 'استلام تحويل', StockCount: 'جرد', ReorderRule: 'إعادة الطلب', OpeningImport: 'استيراد رصيد',
}

export function AuditLog({ token, canSelectLocation }: { token: string; canSelectLocation: boolean }) {
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([])
  const [location, setLocation] = useState('')
  const [cursor, setCursor] = useState<number>()
  const [rows, setRows] = useState<Event[]>()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!canSelectLocation) return
    let active = true
    api<typeof locations>('/locations', token).then(result => { if (active) setLocations(result) },
      (failure: Error) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [token, canSelectLocation])
  useEffect(() => {
    let active = true
    const query = new URLSearchParams()
    if (cursor) query.set('beforeId', String(cursor))
    if (location) query.set('locationId', location)
    api<Event[]>('/reports/audit?' + query, token).then(result => { if (active) setRows(result) },
      (failure: Error) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [token, location, cursor])

  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">سجل التدقيق</h1>
    {canSelectLocation && <label className="panel w-fit">موقع السجل<select value={location} onChange={event => {
      setRows(undefined); setCursor(undefined); setError(''); setLocation(event.target.value)
    }}><option value="">كل المواقع</option>{locations.map(item =>
      <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {error && <p className="error" role="alert">{error}</p>}
    {!rows && !error && <p role="status">جاري تحميل سجل التدقيق…</p>}
    {rows?.length === 0 && <p>لا توجد تغييرات مسجلة في الصفحة الحالية.</p>}
    {!!rows?.length && <div className="panel overflow-auto"><table className="w-full">
      <thead><tr>{['التوقيت', 'المستخدم', 'الموقع', 'العملية', 'السبب'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map(item => <tr key={item.id}>
        <td>{new Date(item.occurredAt).toLocaleString('ar-EG')}</td><td>#{item.userId}</td>
        <td>{item.locationId ?? 'كل المواقع'}{item.destinationId ? ' ← ' + item.destinationId : ''}</td>
        <td>{actions[item.action] ?? item.action} {entities[item.entity] ?? item.entity} {item.recordId ? '#' + item.recordId : ''}
          {item.fields && <small className="block"><bdi>{item.fields}</bdi></small>}</td>
        <td>{item.reason ?? '—'}</td>
      </tr>)}</tbody>
    </table></div>}
    <div className="flex gap-2">
      {cursor && <button className="secondary" onClick={() => { setRows(undefined); setError(''); setCursor(undefined) }}>أحدث التغييرات</button>}
      {rows?.length === 100 && <button className="secondary" onClick={() => { setCursor(rows.at(-1)?.id); setError(''); setRows(undefined) }}>تغييرات أقدم</button>}
    </div>
  </section>
}
