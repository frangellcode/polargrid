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

/** Keeps <html lang> in step with the UI.
 *
 *  It was hard-coded to "en", so a Spanish UI still announced itself as
 *  English: VoiceOver read the whole app with English pronunciation, and the
 *  browser kept offering to translate a page that was already in the reader's
 *  language. Set on load as well as on every switch. */
function applyDocumentLanguage(language: Language) {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

export const useLanguageStore = create<LanguageStoreState>((set) => {
  const initial = readStoredLanguage()
  applyDocumentLanguage(initial)
  return {
    language: initial,
    toggleLanguage: () =>
      set((state) => {
        const next: Language = state.language === 'en' ? 'es' : 'en'
        try {
          localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
        } catch {
          // storage unavailable (private browsing, disabled) — keep the in-memory pick
        }
        applyDocumentLanguage(next)
        return { language: next }
      }),
  }
})

/** Current-language string table — re-renders any component that reads it whenever `toggleLanguage` fires. */
export function useTranslation() {
  return translations[useLanguageStore((s) => s.language)]
}
