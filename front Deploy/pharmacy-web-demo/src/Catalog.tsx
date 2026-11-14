// Searches the product catalog and manages product details for authorized staff.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, money } from './api'
import type { Product } from './api'

export function Catalog({ token, canEdit }: { token: string; canEdit: boolean }) {
  const [products, setProducts] = useState<Product[]>()
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<Product | 'new'>()
  const [archive, setArchive] = useState<Product>()
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    api<Product[]>('/products', token).then(
      result => { if (active) setProducts(result) },
      (failure: Error) => { if (active) setError(failure.message) },
    )
    return () => { active = false }
  }, [token, revision])

  async function change(action: () => Promise<unknown>, message: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setEditor(undefined)
      setArchive(undefined)
      setNotice(message)
      setRevision(value => value + 1)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر حفظ الصنف')
    } finally { setBusy(false) }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const optional = (name: string) => String(fields.get(name) ?? '').trim() || undefined
    const body = {
      name: String(fields.get('name')).trim(),
      barcode: optional('barcode'), category: optional('category'), unit: optional('unit'),
      sellPrice: Number(fields.get('sellPrice')), buyPrice: Number(fields.get('buyPrice')),
      minStock: Number(fields.get('minStock')),
      packName: optional('packName'), packBarcode: optional('packBarcode'),
      packSize: optional('packSize') === undefined ? undefined : Number(fields.get('packSize')),
      packPrice: optional('packPrice') === undefined ? undefined : Number(fields.get('packPrice')),
    }
    if (editor === 'new') void change(() => api('/products', token, body), 'تم إضافة الصنف')
    else if (editor) void change(() => api('/products/' + editor.id, token, body, undefined, 'PUT'), 'تم تعديل الصنف')
  }

  const product = editor === 'new' ? undefined : editor
  const needle = query.trim().toLocaleLowerCase()
  const results = products?.filter(item => [item.name, item.barcode, item.category]
    .some(value => value?.toLocaleLowerCase().includes(needle)))

  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">الأصناف</h1>
    <div className="panel flex flex-wrap items-end gap-3">
      <label className="flex-1">بحث الأصناف<input value={query} onChange={event => setQuery(event.target.value)} /></label>
      {canEdit && <button className="primary" disabled={busy} onClick={() => { setArchive(undefined); setEditor('new') }}>إضافة صنف</button>}
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {editor && <form key={product?.id ?? 'new'} className="panel grid gap-3" onSubmit={save}>
      <h2 className="font-bold">{product ? 'تعديل الصنف' : 'صنف جديد'}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label>اسم الصنف<input name="name" defaultValue={product?.name} maxLength={150} required /></label>
        <label>الباركود<input name="barcode" dir="ltr" defaultValue={product?.barcode} maxLength={80} /></label>
        <label>التصنيف<input name="category" defaultValue={product?.category} maxLength={100} /></label>
        <label>وحدة البيع<input name="unit" defaultValue={product?.unit} maxLength={80} /></label>
        <label>سعر البيع<input name="sellPrice" type="number" min="0" max="1000000" step="0.01" defaultValue={product?.sellPrice} required /></label>
        <label>سعر الشراء<input name="buyPrice" type="number" min="0" max="1000000" step="0.01" defaultValue={product?.buyPrice ?? 0} required /></label>
        <label>حد النقص<input name="minStock" type="number" min="0" max="1000000" defaultValue={product?.minStock ?? 10} required /></label>
      </div>
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend>وحدة بيع إضافية (اختياري)</legend>
        <label>اسم العبوة<input name="packName" defaultValue={product?.packName} maxLength={80} /></label>
        <label>باركود العبوة<input name="packBarcode" dir="ltr" defaultValue={product?.packBarcode} maxLength={80} /></label>
        <label>وحدات الأساس في العبوة<input name="packSize" type="number" min="2" max="1000" defaultValue={product?.packSize} /></label>
        <label>سعر العبوة<input name="packPrice" type="number" min="0" max="1000000" step="0.01" defaultValue={product?.packPrice} /></label>
      </fieldset>
      <div className="flex gap-2"><button className="primary" disabled={busy}>حفظ الصنف</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setEditor(undefined)}>إلغاء</button></div>
    </form>}
    {archive && <div className="panel flex flex-wrap items-center gap-3">
      <p>تأكيد أرشفة {archive.name}</p>
      <button className="primary" disabled={busy} onClick={() =>
        change(() => api('/products/' + archive.id, token, undefined, undefined, 'DELETE'), 'تمت أرشفة الصنف')}>تأكيد الأرشفة</button>
      <button className="secondary" disabled={busy} onClick={() => setArchive(undefined)}>إلغاء</button>
    </div>}
    {!products && !error && <p role="status">جاري التحميل…</p>}
    {results?.length === 0 && <p className="panel">لا توجد أصناف مطابقة.</p>}
    {!!results?.length && <div className="panel overflow-auto p-0"><table className="w-full">
      <thead><tr><th scope="col">الصنف</th><th scope="col">الباركود</th><th scope="col">سعر البيع</th>
        {canEdit && <th scope="col">الإجراءات</th>}</tr></thead>
      <tbody>{results.map(item => <tr key={item.id}>
        <td>{item.name}</td><td><bdi>{item.barcode ?? '—'}</bdi></td><td>{money.format(item.sellPrice)}</td>
        {canEdit && <td><div className="flex gap-2">
          <button className="secondary" disabled={busy} onClick={() => { setArchive(undefined); setEditor(item) }}>تعديل {item.name}</button>
          <button className="secondary" disabled={busy} onClick={() => { setEditor(undefined); setArchive(item) }}>أرشفة {item.name}</button>
        </div></td>}
      </tr>)}</tbody>
    </table></div>}
  </section>
}
