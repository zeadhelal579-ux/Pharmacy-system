// Filters and prints the financial and stock reconciliation report.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, money } from './api'

type Amount = { locationId: number; count: number; amount: number }
type Report = {
  sales: (Amount & { paymentMethod: string | null })[]
  cash: (Amount & { kind: string })[]
  shifts: { id: number; locationId: number; userId: number; openingCash: number; actualCash: number;
    expectedCash: number; difference: number; closeNote: string | null }[]
  stock: { kind: string; count: number; quantity: number }[]
}
const labels: Record<string, string> = { Cash: 'نقدي', Card: 'بطاقات', Deposit: 'إيداع',
  Withdrawal: 'سحب', CashRefund: 'مرتجع نقدي', Sale: 'بيع', OpeningStock: 'رصيد افتتاحي',
  TransferDispatch: 'شحن تحويل', StockCount: 'تسوية جرد', SupplierReturn: 'مرتجع مورد' }

export function Reconciliation({ token, allLocations }: { token: string; allLocations: boolean }) {
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([])
  const [result, setResult] = useState<{ report: Report; from: string; through: string }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!allLocations) return
    let active = true
    api<typeof locations>('/locations', token).then(rows => { if (active) setLocations(rows) },
      (failure: Error) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [token, allLocations])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const from = String(form.get('from'))
    const through = String(form.get('through'))
    const query = new URLSearchParams({ from, through })
    const location = form.get('location')
    if (location) query.set('locationId', String(location))
    setBusy(true)
    setError('')
    setResult(undefined)
    try { setResult({ from, through, report: await api<Report>('/reports/reconciliation?' + query, token) }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'تعذر تحميل التقرير') }
    finally { setBusy(false) }
  }
  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">مطابقة المبيعات والخزنة</h1>
    <form className="panel no-print flex flex-wrap items-end gap-3" onSubmit={submit}>
      <label>من تاريخ<input type="date" name="from" required /></label>
      <label>إلى تاريخ<input type="date" name="through" required /></label>
      {allLocations && <label>موقع التقرير<select name="location"><option value="">كل المواقع</option>
        {locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      <button className="primary" disabled={busy}>عرض المطابقة</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <>
      <p dir="ltr">{result.from} — {result.through}</p>
      <button className="secondary no-print w-fit" onClick={() => window.print()}>طباعة المطابقة</button>
      {['Cash', 'Card', null].map(method => <section key={method ?? 'legacy'} className="panel">
        <h2 className="font-bold">{method ? 'مبيعات ' + labels[method] : 'مبيعات بدون وسيلة مسجلة'}</h2>
        <ul>{result.report.sales.filter(item => item.paymentMethod === method).map(item =>
          <li key={item.locationId}>موقع {item.locationId} · {item.count} فاتورة · {money.format(item.amount)}</li>)}</ul>
        <p>الإجمالي {money.format(result.report.sales.filter(item => item.paymentMethod === method)
          .reduce((total, item) => total + item.amount, 0))}</p>
      </section>)}
      <section className="panel"><h2 className="font-bold">حركات الخزنة</h2>
        {result.report.cash.filter(item => item.kind !== 'CardRefund').map(item => <p key={item.locationId + item.kind}>
          موقع {item.locationId} · {labels[item.kind] ?? item.kind} · {item.count} حركة · {money.format(item.amount)}
        </p>)}
      </section>
      <section className="panel"><h2 className="font-bold">مرتجعات البطاقات</h2>
        {result.report.cash.filter(item => item.kind === 'CardRefund').map(item =>
          <p key={item.locationId}>موقع {item.locationId} · {item.count} مرتجع · {money.format(Math.abs(item.amount))}</p>)}
      </section>
      <section className="panel"><h2 className="font-bold">إقفالات الشيفت</h2>
        {result.report.shifts.map(item => <p key={item.id}>
          شيفت {item.id} · موقع {item.locationId} · مستخدم {item.userId} · افتتاح {money.format(item.openingCash)} ·
          متوقع {money.format(item.expectedCash)} · فعلي {money.format(item.actualCash)} · فرق {money.format(item.difference)}
          {item.closeNote ? ' · ' + item.closeNote : ''}
        </p>)}
      </section>
      <section className="panel"><h2 className="font-bold">حركات المخزون المسجلة</h2>
        {result.report.stock.map(item => <p key={item.kind}>{labels[item.kind] ?? item.kind} · {item.count} حركة · {item.quantity} وحدة</p>)}
      </section>
    </>}
  </section>
}
