// Shares the preferred interface language and updates document direction.
import { useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { LanguageContext } from './language-context'
import type { Language } from './language-context'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem('pharmacy.language') === 'en' ? 'en' : 'ar')
  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    document.title = language === 'ar' ? 'PharmacyERP | إدارة الصيدلية' : 'PharmacyERP | Pharmacy management'
    localStorage.setItem('pharmacy.language', language)
  }, [language])
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
}

export function LanguageSwitch() {
  const { language, setLanguage } = useContext(LanguageContext)
  return <button type="button" className="secondary" lang={language === 'ar' ? 'en' : 'ar'}
    onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}>
    {language === 'ar' ? 'English' : 'العربية'}
  </button>
}
