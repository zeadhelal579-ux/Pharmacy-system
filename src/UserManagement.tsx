// Manages staff accounts and their assigned roles and locations.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from './api'
import type { Session } from './api'

type Option = { id: number; name: string }
type Staff = { id: number; name: string; email: string; roleId: number; locationId: number }
type Directory = { users: Staff[]; roles: Option[]; locations: Option[] }
const roleNames: Record<string, string> = {
  SuperAdmin: 'مدير النظام', BranchManager: 'مدير الفرع', Cashier: 'كاشير', WarehouseAdmin: 'مسؤول المخزن',
}

async function load(token: string): Promise<Directory> {
  const [users, roles, locations] = await Promise.all([
    api<Staff[]>('/users', token), api<Option[]>('/users/roles', token), api<Option[]>('/locations', token),
  ])
  return { users, roles, locations }
}

export function UserManagement({ token, session }: { token: string; session: Session }) {
  const [directory, setDirectory] = useState<Directory>()
  const [editor, setEditor] = useState<Staff | 'new'>()
  const [disable, setDisable] = useState<Staff>()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    load(token).then(result => { if (active) setDirectory(result) },
      (failure: Error) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [token, revision])

  async function change(action: () => Promise<unknown>, confirmation: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setEditor(undefined)
      setDisable(undefined)
      setNotice(confirmation)
      setRevision(value => value + 1)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر حفظ الحساب')
    } finally { setBusy(false) }
  }

  const selected = editor === 'new' ? undefined : editor
  const ownAccount = selected?.id === session.userId
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const body = {
      name: String(fields.get('name')).trim(), email: String(fields.get('email')).trim(),
      passwordHash: String(fields.get('password')),
      roleId: Number(fields.get('role') ?? selected?.roleId),
      locationId: Number(fields.get('location') ?? selected?.locationId),
    }
    if (editor === 'new') void change(() => api('/users', token, body), 'تم إنشاء الحساب')
    else if (selected) void change(() => api('/users/' + selected.id, token, body, undefined, 'PUT'), 'تم تعديل الحساب')
  }

  const needle = query.trim().toLocaleLowerCase()
  return <section className="grid gap-4">
    <h1 className="text-2xl font-bold">المستخدمون</h1>
    <div className="panel flex flex-wrap items-end gap-3">
      <label className="flex-1">بحث المستخدمين<input value={query} onChange={event => setQuery(event.target.value)} /></label>
      <button className="primary" disabled={busy || !directory} onClick={() => { setDisable(undefined); setEditor('new') }}>إضافة مستخدم</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!directory && !error && <p role="status">جاري التحميل…</p>}
    {directory && editor && <form key={selected?.id ?? 'new'} className="panel grid gap-3" onSubmit={save}>
      <h2 className="font-bold">{selected ? 'تعديل الحساب' : 'حساب جديد'}</h2>
      <label>اسم المستخدم<input name="name" defaultValue={selected?.name} maxLength={150} required /></label>
      <label>بريد المستخدم<input name="email" type="email" dir="ltr" defaultValue={selected?.email} maxLength={254} required /></label>
      <label>{selected ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور المؤقتة'}
        <input name="password" type="password" autoComplete="new-password" dir="ltr" minLength={12} maxLength={72} required={!selected} />
      </label>
      <label>الدور<select name="role" defaultValue={selected?.roleId ?? ''} disabled={ownAccount} required>
        <option value="">اختار الدور</option>{directory.roles.map(role =>
          <option key={role.id} value={role.id}>{roleNames[role.name] ?? role.name}</option>)}
      </select></label>
      <label>فرع المستخدم<select name="location" defaultValue={selected?.locationId ?? ''} disabled={ownAccount} required>
        <option value="">اختار الموقع</option>{directory.locations.map(location =>
          <option key={location.id} value={location.id}>{location.name}</option>)}
      </select></label>
      <div className="flex gap-2">
        <button className="primary" disabled={busy}>حفظ الحساب</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setEditor(undefined)}>إلغاء</button>
      </div>
    </form>}
    {disable && <div className="panel flex flex-wrap items-center gap-3">
      <p>تأكيد تعطيل حساب {disable.name}</p>
      <button className="primary" disabled={busy} onClick={() =>
        change(() => api('/users/' + disable.id, token, undefined, undefined, 'DELETE'), 'تم تعطيل الحساب')}>تأكيد التعطيل</button>
      <button className="secondary" disabled={busy} onClick={() => setDisable(undefined)}>إلغاء</button>
    </div>}
    {directory && <div className="panel overflow-auto p-0"><table className="w-full">
      <thead><tr>{['الاسم', 'البريد', 'الدور', 'الموقع', 'الإجراءات'].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
      <tbody>{directory.users.filter(user => user.name.toLocaleLowerCase().includes(needle) ||
        user.email.toLocaleLowerCase().includes(needle)).map(user => {
        const role = directory.roles.find(item => item.id === user.roleId)?.name
        return <tr key={user.id}><td>{user.name}</td><td><bdi>{user.email}</bdi></td>
          <td>{role ? roleNames[role] ?? role : '—'}</td>
          <td>{directory.locations.find(item => item.id === user.locationId)?.name ?? '—'}</td>
          <td><div className="flex flex-wrap gap-2">
            <button className="secondary" disabled={busy} onClick={() => { setDisable(undefined); setEditor(user) }}>تعديل {user.name}</button>
            {user.id !== session.userId && <button className="secondary" disabled={busy}
              onClick={() => { setEditor(undefined); setDisable(user) }}>تعطيل {user.name}</button>}
          </div></td></tr>
      })}</tbody>
    </table></div>}
  </section>
}
