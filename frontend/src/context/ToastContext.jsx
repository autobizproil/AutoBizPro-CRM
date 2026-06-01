import { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)

let _id = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const add = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++_id
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
  }, [])

  const remove = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), [])

  const toast = {
    success: (msg, dur)  => add(msg, 'success', dur),
    error:   (msg, dur)  => add(msg, 'error',   dur ?? 5000),
    info:    (msg, dur)  => add(msg, 'info',     dur),
    warn:    (msg, dur)  => add(msg, 'warn',     dur),
  }

  const STYLES = {
    success: 'bg-emerald-600 text-white',
    error:   'bg-red-600 text-white',
    info:    'bg-[#2398c2] text-white',
    warn:    'bg-amber-500 text-white',
  }

  const ICONS = {
    success: '✓',
    error:   '✕',
    info:    'ℹ',
    warn:    '⚠',
  }

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {/* Toast stack — bottom-right */}
      <div className="fixed bottom-5 left-5 z-[9999] flex flex-col gap-2 pointer-events-none" dir="rtl">
        {toasts.map(t => (
          <div key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm pointer-events-auto animate-slide-up ${STYLES[t.type]}`}>
            <span className="text-base leading-none flex-shrink-0">{ICONS[t.type]}</span>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="opacity-70 hover:opacity-100 text-lg leading-none ml-1">×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}
