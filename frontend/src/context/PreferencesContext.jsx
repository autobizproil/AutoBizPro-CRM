import { createContext, useContext, useState, useEffect } from 'react'

const STORAGE_KEY = 'crm_prefs'

const defaults = {
  theme:    'light',
  lang:     'he',
  fontSize: 'normal',
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults }
  } catch {
    return { ...defaults }
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore storage errors
  }
}

function applyToDOM({ theme, lang, fontSize }) {
  const html = document.documentElement

  // Theme
  if (theme === 'dark') {
    html.classList.add('dark')
  } else {
    html.classList.remove('dark')
  }

  // Font size
  if (fontSize === 'large') {
    html.classList.add('text-lg')
  } else {
    html.classList.remove('text-lg')
  }

  // Language / direction
  html.dir  = lang === 'he' ? 'rtl' : 'ltr'
  html.lang = lang
}

const PreferencesContext = createContext(null)

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(() => loadPrefs())

  // Apply to DOM whenever prefs change
  useEffect(() => {
    applyToDOM(prefs)
    savePrefs(prefs)
  }, [prefs])

  // Apply immediately on mount (before first paint)
  useEffect(() => {
    applyToDOM(loadPrefs())
  }, [])

  const setTheme    = (v) => setPrefs(p => ({ ...p, theme:    v }))
  const setLang     = (v) => setPrefs(p => ({ ...p, lang:     v }))
  const setFontSize = (v) => setPrefs(p => ({ ...p, fontSize: v }))

  return (
    <PreferencesContext.Provider value={{ ...prefs, setTheme, setLang, setFontSize }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider')
  return ctx
}
