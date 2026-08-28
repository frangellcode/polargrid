import { create } from 'zustand'
import { translations, type Language } from '../lib/translations'

const LANGUAGE_STORAGE_KEY = 'polargrid:language'

/** Reads the user's last-picked language from the device (localStorage) —
 *  wrapped in try/catch since storage access can throw (private browsing, disabled storage). */
function readStoredLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'es' ? 'es' : 'en'
  } catch {
    return 'en'
  }
}

interface LanguageStoreState {
  language: Language
  toggleLanguage: () => void
}

export const useLanguageStore = create<LanguageStoreState>((set) => ({
  language: readStoredLanguage(),
  toggleLanguage: () =>
    set((state) => {
      const next: Language = state.language === 'en' ? 'es' : 'en'
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
      } catch {
        // storage unavailable (private browsing, disabled) — keep the in-memory pick
      }
      return { language: next }
    }),
}))

/** Current-language string table — re-renders any component that reads it whenever `toggleLanguage` fires. */
export function useTranslation() {
  return translations[useLanguageStore((s) => s.language)]
}
