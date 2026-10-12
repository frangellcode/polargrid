import { create } from 'zustand'
import { translations, type Language } from '../lib/translations'

const LANGUAGE_STORAGE_KEY = 'polargrid:language'

/** The device's own language, for a first launch: Spanish from any region
 *  (es-MX, es-DO, es-ES, ...) gets Spanish, everything else English. In the
 *  App Store build the web view reports the language iOS picked for the app,
 *  which can be Spanish because Info.plist lists `es` in CFBundleLocalizations. */
function deviceLanguage(): Language {
  const preferred = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  return preferred[0]?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

/** The user's last-picked language (localStorage), or the device's when they
 *  never picked one. Wrapped in try/catch since storage access can throw
 *  (private browsing, disabled storage). */
function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored === 'es' || stored === 'en') return stored
  } catch {
    // storage unavailable — fall through to the device's language
  }
  return deviceLanguage()
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
