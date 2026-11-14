// Provides localized UI copy and currency formatting to the application.
import { createContext, useContext } from 'react'

export type Language = 'ar' | 'en'
export const LanguageContext = createContext<{ language: Language; setLanguage: (value: Language) => void }>({
  language: 'ar', setLanguage: () => {},
})
export function useLanguage() {
  const { language } = useContext(LanguageContext)
  return {
    language,
    text: (ar: string, en: string) => language === 'ar' ? ar : en,
    currency: new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP' }),
  }
}
