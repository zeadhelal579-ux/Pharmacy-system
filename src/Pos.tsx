// Builds a cart from branch stock and opens the persisted receipt after checkout.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from './api'
import type { Batch, Product } from './api'
import { ShiftPanel } from './ShiftPanel'
import { useLanguage } from './language-context'

type Shift = { id: number; openingCash: number; expectedCash?: number; actualCash?: number }
type Checkout = { key: string; body: { shiftId: number; paymentMethod: string; items: { productId: number; quantity: number; isPack?: boolean }[];
  discountAmount?: number; discountReason?: string; discountApprovalId?: number } }
type Offer = { product: Product; available: number; price: number; size: number; isPack: boolean; barcode?: string; label: string }
type DiscountDraft = { cart: Record<string, number>; discount: number; reason: string;
  approval: { id: number; fingerprint: string } }

function readPending(key: string): Checkout | null {
  const value = sessionStorage.getItem(key)
  return value ? JSON.parse(value) as Checkout : null
}

export function Pos({ token, locationId, userId }: { token: string; locationId: number; userId: number }) {
  const { text, currency } = useLanguage()
  const storageKey = 'pharmacy.checkout.' + userId + '.' + locationId
  const draftKey = 'pharmacy.demo.cart.' + userId + '.' + locationId
  const [draft] = useState<DiscountDraft | null>(() => {
    const saved = sessionStorage.getItem(draftKey)
    return saved ? JSON.parse(saved) as DiscountDraft : null
  })
  const [pending, setPending] = useState(() => readPending(storageKey))
  const [batches, setBatches] = useState<Batch[]>()
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<Record<string, number>>(draft?.cart ?? {})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [shift, setShift] = useState<Shift | null>()
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [discount, setDiscount] = useState(draft?.discount ?? 0)
  const [reason, setReason] = useState(draft?.reason ?? '')
  const [approval, setApproval] = useState(draft?.approval)
  const search = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    api<Batch[]>('/inventory/location/' + locationId, token).then(
      rows => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (active) setBatches(rows.filter(batch => !batch.isQuarantined && !batch.product.isDeleted && new Date(batch.expiryDate) >= today))
      },
      (failure: Error) => { if (active) setError(failure.message) },
    )
    return () => { active = false }
  }, [locationId, token])

  const products = new Map<number, { product: Product; available: number }>()
  for (const batch of batches ?? []) {
    const free = batch.quantity - (batch.reservedQuantity ?? 0)
    if (free <= 0) continue
    const available = (products.get(batch.product.id)?.available ?? 0) + free
    products.set(batch.product.id, { product: batch.product, available })
  }
  const offers = new Map<string, Offer>()
  for (const { product, available } of products.values()) {
    offers.set(product.id + ':base', { product, available, size: 1, price: product.sellPrice,
      isPack: false, barcode: product.barcode, label: product.name })
    if (product.packSize && product.packPrice != null && product.packName && available >= product.packSize)
      offers.set(product.id + ':pack', { product, available, size: product.packSize, price: product.packPrice,
        isPack: true, barcode: product.packBarcode, label: product.name + ' · ' + product.packName })
  }
  const matches = [...offers.entries()].filter(([, offer]) =>
    offer.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || offer.barcode?.includes(query.trim()))
  const lines = Object.entries(cart).flatMap(([key, quantity]) => {
    const offer = offers.get(key)
    return offer ? [{ ...offer, key, quantity }] : []
  })
  const items = lines.map(({ product, quantity, isPack }) => ({ productId: product.id, quantity, isPack }))
  const gross = lines.reduce((sum, line) => sum + line.quantity * line.price, 0)
  const fingerprint = JSON.stringify({ items, discount, reason: reason.trim(), shift: shift?.id })
  const currentApproval = approval?.fingerprint === fingerprint ? approval.id : undefined
  async function requestApproval() {
    if (!shift || busy || !items.length || discount <= 0 || !reason.trim()) return
    setBusy(true)
    setError('')
    try {
      const { id } = await api<{ id: number }>('/discounts', token, { shiftId: shift.id, items, amount: discount, reason })
      const requested = { id, fingerprint }
      setApproval(requested)
      sessionStorage.setItem(draftKey, JSON.stringify({ cart, discount, reason, approval: requested }))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'تعذر طلب الاعتماد') }
    finally { setBusy(false) }
  }
  const used = new Map<number, number>()
  for (const line of lines) used.set(line.product.id, (used.get(line.product.id) ?? 0) + line.quantity * line.size)
  const remaining = (offer: Offer) => Math.floor((offer.available - (used.get(offer.product.id) ?? 0)) / offer.size)
  function add(key: string, offer: Offer) {
    if (remaining(offer) < 1) return
    setCart(previous => ({ ...previous, [key]: (previous[key] ?? 0) + 1 }))
    setQuery('')
    search.current?.focus()
  }
  async function checkout() {
    if (submitting.current || (!pending && (!lines.length || !shift))) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const operation = pending ?? { key: crypto.randomUUID(), body: { shiftId: shift!.id,
        paymentMethod, items, discountAmount: discount, discountReason: reason.trim(),
        discountApprovalId: currentApproval } }
      sessionStorage.setItem(storageKey, JSON.stringify(operation))
      setPending(operation)
      const completed = pending ? await api<{ saleId: number }>('/sales/operations/' + operation.key, token)
        .catch((failure: unknown) => {
          if (failure instanceof ApiError && failure.status === 404) return null
          throw failure
        }) : null
      const sale = completed ?? await api<{ saleId: number }>('/sales', token, operation.body, operation.key)
      sessionStorage.removeItem(storageKey)
      sessionStorage.removeItem(draftKey)
      setPending(null)
      navigate('/receipts/' + sale.saleId)
    } catch (failure) {
      if (failure instanceof ApiError && [400, 409, 422].includes(failure.status)) {
        sessionStorage.removeItem(storageKey)
        setPending(null)
      }
      setError(failure instanceof Error ? failure.message : 'تعذر إتمام البيع')
    } finally { submitting.current = false; setBusy(false) }
  }
  return <>
    <h1 className="text-2xl font-bold">{text('نقطة البيع', 'Point of sale')}</h1>
    <ShiftPanel token={token} shift={shift} setShift={setShift} blocked={busy || !!pending || lines.length > 0} />
    {error && <p role="alert" className="error">{error}</p>}
    {pending ? <section className="panel grid gap-3">
      <h2 className="text-xl font-bold">{text('عملية بيع معلّقة', 'Pending sale')}</h2>
      <p>{text('راجع نتيجة نفس العملية قبل بدء بيع جديد.', 'Recover this sale before starting another.')}</p>
      <button className="primary w-fit" disabled={busy} onClick={checkout}>{text('استرجاع عملية البيع', 'Recover sale')}</button>
    </section> : <div className="grid items-start gap-4 lg:grid-cols-[1.25fr_1fr]">
      <section className="panel grid gap-3">
        <label>{text('ابحث بالاسم أو امسح الباركود', 'Search by name or scan a barcode')}
          <input ref={search} autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
            if (event.key !== 'Enter' || busy) return
            const exact = matches.find(([, offer]) => offer.barcode === query.trim())
            if (exact) add(...exact)
          }} />
        </label>
        {!batches && !error && <p role="status">{text('جاري تحميل المخزون…', 'Loading stock…')}</p>}
        {batches && !matches.length && <p>{text('لا توجد أصناف مطابقة ومتاحة للبيع.', 'No matching products available for sale.')}</p>}
        {matches.slice(0, 30).map(([key, offer]) =>
          <button key={key} className="secondary flex justify-between gap-3 text-start" onClick={() => add(key, offer)} disabled={busy || remaining(offer) < 1}>
            <span>{offer.label}</span><span>{currency.format(offer.price)} · {text('متاح', 'Available')} {remaining(offer)}</span>
          </button>)}
      </section>
      <section className="panel grid gap-4">
        <h2 className="text-xl font-bold">{text('السلة', 'Cart')}</h2>
        {!lines.length && <p>{text('امسح باركود أو اختار صنف علشان تبدأ البيع.', 'Scan a barcode or select a product to start.')}</p>}
        {lines.map(line => {
          const max = line.quantity + remaining(line)
          return <div key={line.key} className="flex items-end gap-3">
            <label className="flex-1">{line.label}<input type="number" value={line.quantity} min={1} max={max} disabled={busy}
              onChange={event => { const value = event.target.valueAsNumber; if (Number.isInteger(value) && value >= 1 && value <= max) setCart(previous => ({ ...previous, [line.key]: value })) }} /></label>
            <button className="secondary" disabled={busy} onClick={() => setCart(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== line.key)))}>حذف</button>
          </div>
        })}
        <label>{text('مبلغ الخصم', 'Discount amount')}<input type="number" min="0" max={gross} step="0.01" value={discount} disabled={busy}
          onChange={event => setDiscount(Number(event.target.value))} /></label>
        {discount > 0 && <>
          <label>{text('سبب الخصم', 'Discount reason')}<input value={reason} maxLength={500} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
          {currentApproval ? <p role="status">{text('طلب اعتماد الخصم', 'Discount approval request')} #{currentApproval}</p> :
            <button className="secondary" disabled={busy || !shift || !reason.trim() || discount > gross}
              onClick={requestApproval}>{text('طلب اعتماد الخصم', 'Request discount approval')}</button>}
        </>}
        <p className="text-xl font-bold">{text('الإجمالي', 'Total')} {currency.format(gross - discount)}</p>
        <label>{text('طريقة الدفع', 'Payment method')}<select value={paymentMethod} disabled={busy} onChange={event => setPaymentMethod(event.target.value)}>
          <option value="Cash">{text('نقدي', 'Cash')}</option><option value="Card">{text('بطاقة', 'Card')}</option>
        </select></label>
        <button className="primary" disabled={busy || !lines.length || !shift || discount > gross ||
          (discount > 0 && !reason.trim())} onClick={checkout}>{busy ? text('جاري تسجيل البيع…', 'Recording sale…') : text('تسجيل البيع', 'Record sale')}</button>
      </section>
    </div>}
  </>
}
