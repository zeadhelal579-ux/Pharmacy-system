// Displays the batch decision history and submits documented status changes.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from './api'
import type { Batch } from './api'

type Decision = { id: number; quarantined: boolean; reason: string; userId: number; createdAt: string }

export function BatchStatus({ batch, token, canRelease, onChanged }: {
  batch: Batch; token: string; canRelease: boolean; onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<Decision[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const path = '/inventory/batches/' + batch.id + '/status'

  async function show() {
    setBusy(true)
    setError('')
    try {
      setHistory(await api<Decision[]>(path, token))
      setOpen(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر تحميل سجل الدفعة')
    } finally { setBusy(false) }
  }

  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const reason = String(new FormData(event.currentTarget).get('reason')).trim()
    setBusy(true)
    setError('')
    try {
      await api(path, token, { isQuarantined: !batch.isQuarantined, reason })
      onChanged()
      setOpen(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر تغيير حالة الدفعة')
    } finally { setBusy(false) }
  }

  return <div className="grid gap-2">
    <button className="secondary" disabled={busy} aria-expanded={open}
      onClick={() => { if (open) setOpen(false); else void show() }}>حالة الدفعة {batch.batchNumber ?? batch.id}</button>
    {error && <p className="error" role="alert">{error}</p>}
    {open && <>
      {history.length > 0 && <ul aria-label="سجل حالة الدفعة">{history.map(item =>
        <li key={item.id}>{item.quarantined ? 'عزل' : 'فك عزل'} · {item.reason} · مستخدم {item.userId} · {new Date(item.createdAt).toLocaleString('ar-EG')}</li>)}</ul>}
      {(!batch.isQuarantined || canRelease) && <form className="grid gap-2" onSubmit={change}>
        <label>سبب تغيير الحالة<input name="reason" required maxLength={500} /></label>
        <button className="primary" disabled={busy}>{batch.isQuarantined ? 'فك عزل الدفعة' : 'عزل الدفعة'}</button>
      </form>}
    </>}
  </div>
}
