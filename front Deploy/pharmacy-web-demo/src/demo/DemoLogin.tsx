// Presents the role picker and explains how the sample pharmacy can be explored.
import { useState } from 'react'
import { LanguageSwitch } from '../Language'
import { useLanguage } from '../language-context'
import { profiles } from './roles'
import type { Profile } from './roles'
import { resetDemo } from './store'

type Props = { onSelect: (profile: Profile) => boolean }

export function DemoLogin({ onSelect }: Props) {
  const { text } = useLanguage()
  const [message, setMessage] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  return <main className="demo-login">
    <section className="demo-intro" aria-labelledby="demo-title">
      <div className="demo-brand"><span aria-hidden="true">+</span> PharmacyERP</div>
      <div className="grid gap-5">
        <p className="demo-kicker">{text('صيدلية متعددة الفروع', 'Multi-branch pharmacy')}</p>
        <h1 id="demo-title">{text('من استلام الدفعة لحد الفاتورة', 'From receiving stock to issuing a receipt')}</h1>
        <p>{text('جرّب نفس الصيدلية من وجهة نظر الكاشير والمخزن والإدارة.',
          'Explore the same pharmacy as a cashier, warehouse operator or manager.')}</p>
      </div>
      <ol className="demo-workflow" aria-label={text('دورة المخزون', 'Stock workflow')}>
        <li>{text('استلام دفعة', 'Receive a batch')}</li>
        <li>{text('تحويل للفرع', 'Transfer to a branch')}</li>
        <li>{text('بيع وفاتورة', 'Sell and issue a receipt')}</li>
      </ol>
    </section>
    <section className="demo-picker" aria-labelledby="demo-roles">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <p className="demo-kicker">{text('نسخة العرض', 'Live demo')}</p>
          <h2 className="text-3xl font-bold" id="demo-roles">{text('اختار دور وجرب', 'Choose a role')}</h2>
        </div>
        <LanguageSwitch />
      </div>
      <p className="demo-muted">{text('اضغط على الدور للدخول مباشرة.', 'Select a role to sign in instantly.')}</p>
      <div className="grid gap-2">
        {profiles.map((profile, index) => <button type="button" className="demo-role" key={profile.role}
          onClick={() => {
            if (!onSelect(profile)) setMessage(text('الحساب اتعطّل أثناء التجربة. استرجع بيانات الديمو لتجربته.',
              'This account was disabled during the demo. Reset the demo to restore it.'))
          }}>
          <span className="demo-role-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round"
              strokeLinejoin="round">
              <path d={roleIcons[index]} />
            </svg>
          </span>
          <span className="grid gap-1"><strong>{text(profile.title[0], profile.title[1])}</strong>
            <span className="demo-muted">{text(profile.description[0], profile.description[1])}</span></span>
          <span className="demo-arrow" aria-hidden="true">›</span>
        </button>)}
      </div>
      <p className="demo-muted">{text('البيانات تجريبية وتغييراتك بتتحفظ في المتصفح ده.',
        'Sample data and your changes stay in this browser.')}</p>
      {confirmReset ? <div className="grid gap-2">
        <p>{text('ترجع لبيانات البداية وتمسح تغييرات العرض؟', 'Restore the sample data and clear your changes?')}</p>
        <div className="flex flex-wrap gap-2">
          <button className="primary" onClick={() => {
            resetDemo()
            setConfirmReset(false)
            setMessage(text('تم استرجاع بيانات الديمو.', 'Sample data restored.'))
          }}>{text('استرجاع البيانات', 'Reset data')}</button>
          <button className="secondary" onClick={() => setConfirmReset(false)}>{text('إلغاء', 'Cancel')}</button>
        </div>
      </div> : <button className="demo-reset" onClick={() => setConfirmReset(true)}>
        {text('استرجاع بيانات الديمو', 'Reset demo data')}</button>}
      {message && <p role="status" className="demo-muted">{message}</p>}
    </section>
  </main>
}

const roleIcons = [
  'M12 22s7-3 7-9V5l-7-3-7 3v8c0 6 7 9 7 9ZM9 12l2 2 4-4',
  'M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12h8m-8 4h6',
  'M4 7h16v12H4zM7 7l2-4h6l2 4M4 15h16m-12 2h3',
  'M3 21V9l9-6 9 6v12M3 21h18M7 21v-9h10v9m-10-6h10m-10 3h10',
]
