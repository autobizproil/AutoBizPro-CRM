import { useState, useEffect } from 'react'

function itemLabel(item, tr) {
  return item.labelKey ? tr(item.labelKey) : item.label
}

export default function NavEditModal({ open, onClose, pinned, more, onSave, tr }) {
  const [localPinned, setLocalPinned] = useState(pinned)
  const [localMore, setLocalMore] = useState(more)
  const [dragKey, setDragKey] = useState(null)

  useEffect(() => {
    if (open) { setLocalPinned(pinned); setLocalMore(more) }
  }, [open, pinned, more])

  if (!open) return null

  const findAndRemove = (key) => {
    let found = localPinned.find(i => i.key === key)
    let fromPinned = true
    if (!found) { found = localMore.find(i => i.key === key); fromPinned = false }
    return { found, fromPinned }
  }

  const dropInto = (targetGroup, targetIndex) => {
    if (!dragKey) return
    const { found } = findAndRemove(dragKey)
    if (!found) return
    setLocalPinned(p => p.filter(i => i.key !== dragKey))
    setLocalMore(m => m.filter(i => i.key !== dragKey))
    const setter = targetGroup === 'pinned' ? setLocalPinned : setLocalMore
    setter(list => {
      const next = list.slice()
      next.splice(targetIndex, 0, found)
      return next
    })
    setDragKey(null)
  }

  const handleSave = () => {
    onSave(
      localPinned.map((item, position) => ({ key: item.key, position })),
      localMore.map((item, position) => ({ key: item.key, position })),
    )
    onClose()
  }

  const resetDefault = () => {
    localStorage.removeItem('crm_nav_layout')
    window.location.reload()
  }

  const renderGroup = (title, items, group) => (
    <div className="flex-1">
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{title}</div>
      <div
        className="space-y-1 min-h-[80px] border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-2"
        onDragOver={e => e.preventDefault()}
        onDrop={() => dropInto(group, items.length)}
      >
        {items.map((item, i) => (
          <div key={item.key}
            draggable
            onDragStart={() => setDragKey(item.key)}
            onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
            onDrop={e => { e.stopPropagation(); dropInto(group, i) }}
            className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm cursor-move flex items-center gap-2">
            <span className="text-gray-300 dark:text-gray-500">⠿</span>
            {item.icon && <span>{item.icon}</span>}
            {itemLabel(item, tr)}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">עריכת תפריט</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 flex gap-4">
          {renderGroup('בסרגל הראשי', localPinned, 'pinned')}
          {renderGroup('בתפריט עוד', localMore, 'more')}
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={handleSave}
            className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] text-white py-2.5 rounded-lg text-sm font-medium transition-colors">שמור</button>
          <button onClick={resetDefault}
            className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">איפוס לברירת מחדל</button>
        </div>
      </div>
    </div>
  )
}
