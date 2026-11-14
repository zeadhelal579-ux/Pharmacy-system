// Presents the authenticated pharmacy workspaces.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api'
import type { Batch, Product, Sale, Session } from './api'
import { Pos } from './Pos'
import { CashReturn } from './CashReturn'
import { Purchasing } from './Purchasing'
import { Transfers } from './Transfers'
import { StockCounts } from './StockCounts'
import { Catalog } from './Catalog'
import { UserManagement } from './UserManagement'
import { OpeningStock } from './OpeningStock'
import { BatchStatus } from './BatchStatus'
import { LotTrace } from './LotTrace'
import { Reconciliation } from './Reconciliation'
import { AuditLog } from './AuditLog'
import { Discounts } from './Discounts'
import { LanguageSwitch } from './Language'
import { useLanguage } from './language-context'
import { Replenishment } from './Replenishment'

type Auth = { token: string; session: Session }
type Row = { id: number; name?: string; email?: string; status?: string; quantity?: number; product?: Product; currentQuantity?: number; location?: { name: string } }
const metrics: Record<string, [string, string]> = {
  totalProducts: ['الأصناف', 'Products'], totalSalesToday: ['مبيعات اليوم', 'Sales today'], totalLocations: ['المواقع', 'Locations'],
  pendingTransfers: ['تحويلات معلقة', 'Pending transfers'], shortageAlerts: ['تنبيهات النواقص', 'Shortage alerts'],
  expiringBatches: ['دفعات قرب الانتهاء', 'Expiring batches'],
}

export default function App() {
  const { text, currency } = useLanguage()
  const [auth, setAuth] = useState<Auth>()
  if (!auth) return <Login onLogin={setAuth} />
  const { token, session } = auth
  const canSell = ['SuperAdmin', 'BranchManager', 'Cashier'].includes(session.role)
  const admin = session.role === 'SuperAdmin'
  const canPurchase = ['SuperAdmin', 'BranchManager', 'WarehouseAdmin'].includes(session.role)
  const canReconcile = admin || session.role === 'BranchManager'
  const links = [['/', text('لوحة التشغيل', 'Dashboard')], ['/receipts', text('الفواتير', 'Receipts')], ['/inventory', text('المخزون', 'Inventory')],
    ['/products', text('الأصناف', 'Products')], ['/transfers', text('التحويلات', 'Transfers')], ['/reports', text('التقارير', 'Reports')]]
  if (canSell) links.splice(1, 0, ['/pos', text('نقطة البيع', 'Point of sale')])
  if (admin) links.push(['/users', text('المستخدمون', 'Users')])
  if (canPurchase) links.push(['/purchasing', text('المشتريات', 'Purchasing')])
  if (canPurchase) links.push(['/stock-counts', text('الجرد', 'Stock counts')])
  if (canPurchase) links.push(['/replenishment', text('إعادة الطلب', 'Replenishment')])
  if (canPurchase) links.push(['/lot-trace', text('تتبّع الدفعات', 'Lot trace')])
  if (canReconcile) links.push(['/reconciliation', text('المطابقة', 'Reconciliation')])
  if (canReconcile) links.push(['/audit', text('سجل التدقيق', 'Audit log')])
  if (canReconcile) links.push(['/discounts', text('اعتماد الخصومات', 'Discount approvals')])
  const canImport = admin || session.role === 'BranchManager'
  if (canImport) links.push(['/opening-stock', text('استيراد الأرصدة', 'Opening stock import')])
  return <BrowserRouter>
    <header className="border-b border-emerald-900/10 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 p-4">
        <strong className="text-xl text-primary">PharmacyERP</strong>
        <div className="flex flex-wrap items-center gap-3"><span>{text('الموقع', 'Location')} {session.locationId} · <bdi>{session.email}</bdi></span>
          <LanguageSwitch />
          <button className="secondary" onClick={() => setAuth(undefined)}>{text('خروج', 'Sign out')}</button></div>
      </div>
    </header>
    <nav aria-label={text('مساحات العمل', 'Workspaces')} className="mx-auto flex max-w-7xl flex-wrap gap-2 p-4">
      {links.map(([path, label]) => <NavLink key={path} to={path} end={path === '/'}
        className={({ isActive }) => 'rounded-lg px-3 py-2 ' + (isActive ? 'bg-primary text-white' : 'hover:bg-white')}>{label}</NavLink>)}
    </nav>
    <main className="mx-auto grid max-w-7xl gap-4 px-4 pb-8">
      <Routes>
        <Route path="/" element={<Load<Record<string, number>> title={text('لوحة التشغيل', 'Dashboard')} path="/dashboard" token={token}>{data =>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(metrics).map(([key, label]) =>
            <article key={key} className="panel"><p>{text(...label)}</p><strong className="text-2xl">{key === 'totalSalesToday' ? currency.format(data[key]) : data[key]}</strong></article>)}</div>
        }</Load>} />
        {canSell && <Route path="/pos" element={<Pos token={token} locationId={session.locationId} userId={session.userId} />} />}
        <Route path="/receipts" element={<Load<Sale[]> title={text('الفواتير', 'Receipts')} path="/sales" token={token}>{data =>
          <Table headers={[text('رقم الفاتورة', 'Receipt number'), text('الإجمالي', 'Total'), text('التاريخ', 'Date')]} rows={data.map(row => [<NavLink key={row.id} to={'/receipts/' + row.id}>{row.id}</NavLink>, currency.format(row.totalAmount), date(row.createdAt)])} />
        }</Load>} />
        <Route path="/receipts/:id" element={<Receipt token={token} canRefund={canSell} />} />
        <Route path="/inventory" element={<Inventory token={token} session={session} canManage={canPurchase} />} />
        <Route path="/products" element={<Catalog token={token} canEdit={admin || session.role === 'BranchManager'} />} />
        <Route path="/transfers" element={<Transfers token={token} session={session} />} />
        <Route path="/reports" element={<Reports token={token} />} />
        {canPurchase && <Route path="/replenishment" element={<Replenishment token={token} session={session} />} />}
        {canReconcile && <Route path="/reconciliation" element={<Reconciliation token={token} allLocations={admin} />} />}
        {canReconcile && <Route path="/audit" element={<AuditLog token={token} canSelectLocation={admin} />} />}
        {canReconcile && <Route path="/discounts" element={<Discounts token={token} userId={session.userId} />} />}
        {canPurchase && <Route path="/purchasing" element={<Purchasing token={token} session={session} />} />}
        {canPurchase && <Route path="/stock-counts" element={<StockCounts token={token} session={session} />} />}
        {canPurchase && <Route path="/lot-trace" element={<LotTrace token={token} canRecall={admin} />} />}
        {canImport && <Route path="/opening-stock" element={<OpeningStock token={token} locationId={session.locationId} />} />}
        {admin && <Route path="/users" element={<UserManagement token={token} session={session} />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </BrowserRouter>
}

function Login({ onLogin }: { onLogin: (auth: Auth) => void }) {
  const { text } = useLanguage()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const { token } = await api<{ token: string }>('/auth/login', '', Object.fromEntries(fields))
      onLogin({ token, session: await api<Session>('/auth/session', token) })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر تسجيل الدخول')
    } finally { setBusy(false) }
  }
  return <main className="grid min-h-screen place-items-center px-4">
    <form className="panel grid w-full max-w-md gap-5" onSubmit={submit}>
      <div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-primary">PharmacyERP</p>
        <h1 className="mt-2 text-3xl font-bold">{text('تسجيل الدخول', 'Sign in')}</h1></div><LanguageSwitch /></div>
      <label>{text('البريد الإلكتروني', 'Email')}<input name="email" dir="ltr" type="email" autoComplete="username" required /></label>
      <label>{text('كلمة المرور', 'Password')}<input name="password" dir="ltr" type="password" autoComplete="current-password" required /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? text('جاري الدخول…', 'Signing in…') : text('دخول', 'Sign in')}</button>
    </form>
  </main>
}

function Load<T>({ title, path, token, children }: { title: string; path: string; token: string; children: (data: T) => React.ReactNode }) {
  const { text } = useLanguage()
  const [state, setState] = useState<{ path: string; data?: T; error?: string }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    api<T>(path, token).then(data => { if (active) setState({ path, data }) }, (error: Error) => {
      if (active) setState({ path, error: error.message })
    })
    return () => { active = false }
  }, [path, token, attempt])
  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">{title}</h1>
    {state?.path !== path ? <p role="status">{text('جاري التحميل…', 'Loading…')}</p> : state.error ?
      <div><p role="alert" className="error">{state.error}</p><button className="secondary mt-2" onClick={() => { setState(undefined); setAttempt(value => value + 1) }}>{text('إعادة المحاولة', 'Retry')}</button></div> :
      state.data !== undefined && children(state.data)}
  </section>
}

function Inventory({ token, session, canManage }: { token: string; session: Session; canManage: boolean }) {
  const [revision, setRevision] = useState(0)
  return <Load<Batch[]> key={revision} title="مخزون الفرع" path={'/inventory/location/' + session.locationId} token={token}>{data =>
    <Table headers={['الصنف', 'الدفعة', 'الكمية', 'الصلاحية', 'الحالة', ...(canManage ? ['الإجراءات'] : [])]}
      rows={data.map(row => [row.product.name, row.batchNumber ?? row.id, row.quantity, date(row.expiryDate),
        row.isQuarantined ? 'معزولة' : 'في المخزون', ...(canManage ? [
          <BatchStatus key={row.id} batch={row} token={token} canRelease={session.role !== 'WarehouseAdmin'}
            onChanged={() => setRevision(value => value + 1)} />,
        ] : [])])} />
  }</Load>
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  const { text } = useLanguage()
  if (!rows.length) return <p className="panel">{text('لا توجد بيانات لعرضها.', 'No records to display.')}</p>
  return <div className="panel overflow-auto p-0"><table className="w-full">
    <thead className="bg-emerald-50"><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
  </table></div>
}

function Reports({ token }: { token: string }) {
  const [tab, setTab] = useState<'expiry' | 'shortage'>('expiry')
  return <><div className="flex gap-2">
    <button className="secondary" aria-pressed={tab === 'expiry'} onClick={() => setTab('expiry')}>الصلاحية</button>
    <button className="secondary" aria-pressed={tab === 'shortage'} onClick={() => setTab('shortage')}>النواقص</button>
  </div>{tab === 'expiry' ?
    <Load<Batch[]> title="تقرير الصلاحية" path="/reports/expiring" token={token}>{data =>
      <Table headers={['الصنف', 'الكمية', 'الصلاحية']} rows={data.map(row => [row.product.name, row.quantity, date(row.expiryDate)])} />}</Load> :
    <Load<Row[]> title="تقرير النواقص" path="/reports/shortages" token={token}>{data =>
      <Table headers={['الصنف', 'الكمية الحالية', 'الموقع']} rows={data.map(row => [row.product?.name, row.currentQuantity, row.location?.name])} />}</Load>}
  </>
}

function Receipt({ token, canRefund }: { token: string; canRefund: boolean }) {
  const { text, currency, language } = useLanguage()
  const id = location.pathname.split('/').at(-1)
  return <Load<Sale> title={text('فاتورة ', 'Receipt ') + id} path={'/sales/' + id} token={token}>{sale =>
    <><p>{new Date(sale.createdAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-EG')}</p>
      <Table headers={[text('الصنف', 'Product'), text('وحدة البيع', 'Sale unit'), text('الكمية', 'Quantity'),
        text('سعر الوحدة', 'Unit price'), text('الإجمالي', 'Total')]} rows={receiptLines(sale).map(item =>
        [item.product.name, item.soldUnit ?? '—', item.quantity / (item.unitsPerPack ?? 1),
          currency.format(item.unitPrice), currency.format(item.amount ?? item.quantity * item.unitPrice)])} />
      <p className="text-xl font-bold">{text('الإجمالي', 'Total')} {currency.format(sale.totalAmount)}</p>
      {!!sale.discountAmount && <p>{text('الخصم', 'Discount')} {currency.format(sale.discountAmount)}</p>}
      <button className="primary w-fit" onClick={() => window.print()}>{text('طباعة الإيصال', 'Print receipt')}</button>
      {canRefund && (sale.paymentMethod === 'Cash' || sale.paymentMethod === 'Card') &&
        <CashReturn key={sale.id} token={token} sale={sale} />}</>
  }</Load>
}
function receiptLines(sale: Sale) {
  const lines = new Map<string, Sale['saleItems'][number]>()
  for (const item of sale.saleItems) {
    const key = item.lineNumber == null ? 'legacy-' + item.id : 'line-' + item.lineNumber
    const prior = lines.get(key)
    if (!prior) lines.set(key, { ...item })
    else {
      prior.quantity += item.quantity
      prior.amount = (prior.amount ?? 0) + (item.amount ?? 0)
    }
  }
  return [...lines.values()]
}
function date(value: string) { return new Date(value).toLocaleDateString('ar-EG') }
