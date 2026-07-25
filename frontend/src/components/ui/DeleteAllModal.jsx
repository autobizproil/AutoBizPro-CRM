import { useState } from 'react'

export default function DeleteAllModal({ open, onClose, onConfirm, entityLabel, total }) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)

  if (!open) return null

  const canConfirm = text === 'מחק' && !pending

  const handleConfirm = async () => {
    setPending(true)
    try {
      await onConfirm()
      setText('')
      onClose()
    } finally {
      setPending(false)
    }
  }

  const handleClose = () => {
    setText('')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={handleClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-red-600 dark:text-red-400">מחיקת הכל</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            פעולה בלתי הפיכה! ימחקו כל {total} {entityLabel}.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              הקלד "מחק" לאישור
            </label>
            <input
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={!canConfirm}
              onClick={handleConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {pending ? 'מוחק...' : 'מחק הכל לצמיתות'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
