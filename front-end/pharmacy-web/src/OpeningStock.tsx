// Reviews opening-stock files before submitting them to the inventory API.
import { useState } from 'react'
import { api } from './api'

type Row = { name: string; barcode: string; batchNumber: string; expiryDate: string | null; quantity: number; sellPrice: number }
type Review = { errors: { row: number; message: string }[]; rowCount: number; alreadyApplied: boolean }
const columns = 'name\tbarcode\tbatchNumber\texpiryDate\tquantity\tsellPrice'

export function OpeningStock({ token, locationId }: { token: string; locationId: number }) {
  const [rows, setRows] = useState<Row[]>([])
  const [review, setReview] = useState<Review>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function read(file?: File) {
    setRows([])
    setReview(undefined)
    setDone(false)
    setError('')
    if (!file) return
    if (file.size > 512000) { setError('حجم الملف أكبر من الحد المسموح'); return }
    setBusy(true)
    try {
      const [header, ...lines] = (await file.text()).trimEnd().split(/\r?\n/)
      if (header !== columns || !lines.length || lines.length > 500)
        throw new Error('استخدم عناوين نموذج TSV وأضف من 1 إلى 500 صف.')
      setRows(lines.map((line, index) => {
        const values = line.split('\t')
        if (values.length !== 6) throw new Error('عدد الأعمدة غير صحيح في الصف ' + (index + 1))
        const [name, barcode, batchNumber, expiry, quantity, price] = values.map(value => value.trim())
        const expiryDate = /^\d{4}-\d{2}-\d{2}$/.test(expiry) &&
          new Date(expiry).toJSON()?.slice(0, 10) === expiry ? expiry : null
        const amount = Number(quantity)
        const sellPrice = Number(price)
        if (!quantity || !price || !Number.isInteger(amount) || amount < 1 || amount > 1000000 ||
            !Number.isFinite(sellPrice) || sellPrice < 0 || sellPrice > 1000000)
          throw new Error('راجع الكمية والسعر في الصف ' + (index + 1))
        return { name, barcode, batchNumber, expiryDate, quantity: amount, sellPrice }
      }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر قراءة الملف')
    } finally { setBusy(false) }
  }

  async function send(action: 'preview' | 'apply') {
    setBusy(true)
    setError('')
    if (action === 'preview') setReview(undefined)
    try {
      const result = await api<Review>('/opening-stock/' + action, token, { rows, locationId })
      setReview(result)
      setDone(action === 'apply' || result.alreadyApplied)
    } catch (failure) {
      setReview(undefined)
      setError(failure instanceof Error ? failure.message : 'تعذر تنفيذ الاستيراد')
    } finally { setBusy(false) }
  }

  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">استيراد الأرصدة الافتتاحية</h1>
    <div className="panel grid gap-3">
      <p>الاستيراد لموقع {locationId}. المطلوب ملف TSV بترميز UTF-8 وتاريخ بصيغة YYYY-MM-DD. صف واحد لكل دفعة.</p>
      <a className="text-primary underline" download="opening-stock.tsv"
        href={'data:text/tab-separated-values;charset=utf-8,' + encodeURIComponent(columns + '\n')}>تنزيل نموذج الاستيراد</a>
      <label>ملف الأرصدة<input type="file" accept=".tsv,.txt" disabled={busy} onChange={event => void read(event.target.files?.[0])} /></label>
      {rows.length > 0 && <p>صفوف الملف {rows.length} · إجمالي الوحدات {rows.reduce((sum, row) => sum + row.quantity, 0)}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="secondary" disabled={busy || !rows.length || done} onClick={() => send('preview')}>معاينة الاستيراد</button>
        <button className="primary" disabled={busy || !review || !!review.errors.length || done} onClick={() => send('apply')}>اعتماد الاستيراد</button>
      </div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {review && (review.errors.length ? <ul className="error" aria-label="استثناءات الاستيراد">
      {review.errors.map((issue, index) => <li key={index}>صف {issue.row} · {issue.message}</li>)}
    </ul> : <p role="status">{review.alreadyApplied ? 'الملف مسجل بالفعل' : done ? 'تم اعتماد الاستيراد' : 'المعاينة جاهزة للاعتماد'}</p>)}
  </section>
}
