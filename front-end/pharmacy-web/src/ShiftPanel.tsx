// Opens the operator shift and records closing cash reconciliation.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from './api'
import { useLanguage } from './language-context'

type Shift = { id: number; openingCash: number; expectedCash?: number; actualCash?: number }
type Props = { token: string; shift?: Shift | null; setShift: (value: Shift | null) => void; blocked: boolean }

export function ShiftPanel({ token, shift, setShift, blocked }: Props) {
  const { text, currency } = useLanguage()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [closed, setClosed] = useState<Shift>()
  const [movement, setMovement] = useState('')
  const pending = useRef<{ payload: string; operationId: string } | null>(null)

  useEffect(() => {
    let active = true
    api<Shift | null>('/shifts/current', token).then(
      result => { if (active) setShift(result) },
      (failure: Error) => { if (active) setError(failure.message) },
    )
    return () => { active = false }
  }, [token, setShift])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const cash = Number(fields.get('cash'))
      if (shift) {
        setClosed(await api<Shift>('/shifts/' + shift.id + '/close', token,
          { actualCash: cash, note: String(fields.get('note') ?? '') }))
        setShift(null)
      } else {
        setShift(await api<Shift>('/shifts', token, { openingCash: cash }))
        setClosed(undefined)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر حفظ الشيفت')
    } finally { setBusy(false) }
  }

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!shift || busy) return
    const form = event.currentTarget
    const fields = new FormData(form)
    const body = {
      kind: String(fields.get('kind')),
      amount: Number(fields.get('amount')),
      reason: String(fields.get('reason')),
    }
    const payload = JSON.stringify({ shift: shift.id, ...body })
    if (pending.current?.payload !== payload) pending.current = { payload, operationId: crypto.randomUUID() }
    setBusy(true)
    setError('')
    setMovement('')
    try {
      await api('/shifts/' + shift.id + '/movements', token, { ...body, operationId: pending.current.operationId })
      pending.current = null
      form.reset()
      setMovement(text('تم تسجيل حركة الخزنة', 'Cash movement recorded'))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر تسجيل حركة الخزنة')
    } finally { setBusy(false) }
  }

  return <section className="panel grid gap-3">
    <h2 className="text-lg font-bold">{shift ? text('شيفت مفتوح #', 'Open shift #') + shift.id : text('الخزنة والشيفت', 'Cash drawer and shift')}</h2>
    {error && <p className="error" role="alert">{error}</p>}
    {closed?.expectedCash !== undefined && closed.actualCash !== undefined &&
      <p role="status">{text('المتوقع', 'Expected')} {currency.format(closed.expectedCash)} · {text('الفعلي', 'Actual')} {currency.format(closed.actualCash)}</p>}
    {shift === undefined ? <p role="status">{text('جاري التحقق من الشيفت…', 'Checking shift…')}</p> :
      <form key={shift?.id ?? 'open'} className="flex flex-wrap items-end gap-3" onSubmit={submit}>
        <label>{shift ? text('النقد الفعلي', 'Actual cash') : text('رصيد الافتتاح', 'Opening cash')}
          <input name="cash" type="number" min="0" max="100000000" step="0.01" required />
        </label>
        {shift && <label>{text('سبب فرق النقدية', 'Cash difference reason')}<input name="note" maxLength={500} /></label>}
        <button className="secondary" disabled={busy || (Boolean(shift) && blocked)}>
          {shift ? text('إقفال الشيفت', 'Close shift') : text('فتح الشيفت', 'Open shift')}
        </button>
      </form>}
    {shift && <form className="flex flex-wrap items-end gap-3 border-t border-emerald-900/10 pt-3" onSubmit={adjust}>
      <label>{text('نوع الحركة', 'Movement type')}<select name="kind">
        <option value="Deposit">{text('إيداع', 'Deposit')}</option><option value="Withdrawal">{text('سحب', 'Withdrawal')}</option>
      </select></label>
      <label>{text('المبلغ', 'Amount')}<input name="amount" type="number" min="0.01" max="100000000" step="0.01" required /></label>
      <label>{text('سبب حركة الخزنة', 'Cash movement reason')}<input name="reason" maxLength={500} required /></label>
      <button className="secondary" disabled={busy}>{text('تسجيل حركة الخزنة', 'Record cash movement')}</button>
    </form>}
    {movement && <p role="status">{movement}</p>}
  </section>
}
