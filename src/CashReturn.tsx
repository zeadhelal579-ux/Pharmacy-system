// Records a cash refund linked to an original receipt allocation.
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, money } from './api'
import type { Sale } from './api'

export function CashReturn({ token, sale }: { token: string; sale: Sale }) {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef<{ payload: string; operationId: string } | null>(null)

  async function refund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const fields = new FormData(form)
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const shift = await api<{ id: number } | null>('/shifts/current', token)
      if (!shift) throw new Error('افتح شيفت قبل تسجيل المرتجع.')
      const body = {
        shiftId: shift.id, saleItemId: Number(fields.get('line')),
        quantity: Number(fields.get('quantity')), reason: String(fields.get('reason')),
      }
      const payload = JSON.stringify(body)
      if (pending.current?.payload !== payload) pending.current = { payload, operationId: crypto.randomUUID() }
      const result = await api<{ amount: number }>('/sales/' + sale.id + '/returns', token,
        { ...body, operationId: pending.current.operationId })
      pending.current = null
      form.reset()
      setMessage((sale.paymentMethod === 'Cash' ? 'تم تسجيل رد نقدي بقيمة ' : 'تم تسجيل مرتجع بطاقة بقيمة ') +
        money.format(Math.abs(result.amount)))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر تسجيل المرتجع')
    } finally { setBusy(false) }
  }

  return <form className="panel no-print grid gap-3" onSubmit={refund}>
    <h2 className="text-lg font-bold">{sale.paymentMethod === 'Cash' ? 'مرتجع نقدي' : 'مرتجع بطاقة'}</h2>
    {sale.paymentMethod === 'Card' && <p>نفّذ الرد على جهاز الدفع قبل تسجيله في النظام.</p>}
    <label>بند الفاتورة<select name="line">{sale.saleItems.map(item =>
      <option key={item.id} value={item.id}>{item.product.name} · بند {item.id} · الكمية {item.quantity}</option>
    )}</select></label>
    <label>كمية المرتجع<input name="quantity" type="number" min="1" step="1" required /></label>
    <label>سبب المرتجع<input name="reason" maxLength={500} required /></label>
    <button className="secondary w-fit" disabled={busy}>{sale.paymentMethod === 'Cash' ? 'تسجيل المرتجع النقدي' : 'تسجيل مرتجع البطاقة'}</button>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </form>
}
