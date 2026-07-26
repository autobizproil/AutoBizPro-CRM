import { useCallback, useEffect, useRef, useState } from 'react'
import { useSavedViews } from '../../hooks/useSavedViews'
import { isViewDirty } from '../../lib/savedViewsDiff'

const viewToPatch = (view) => ({
  search: view.search || '',
  dateFrom: view.date_from || '',
  dateTo: view.date_to || '',
  conditions: view.conditions ?? [],
  visibleColumns: view.visible_columns ?? null,
})

const EMPTY_PATCH = { search: '', dateFrom: '', dateTo: '', conditions: [], visibleColumns: null }

export default function SavedViewsBar({ layout = 'dropdown', entityType, entityKey, currentState, onApply }) {
  const [activeViewId, setActiveViewId] = useState(null)
  const [open, setOpen] = useState(false)
  const [saveModal, setSaveModal] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const barRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const onApplyDefault = useCallback((view) => {
    setActiveViewId(view.id)
    onApply(viewToPatch(view))
  }, [onApply])

  const { views, create, update, remove, setDefault } = useSavedViews(entityType, entityKey, onApplyDefault)

  const activeView = views.find(v => v.id === activeViewId) ?? null
  const dirty = isViewDirty(activeView, currentState)

  const selectView = (view) => {
    setActiveViewId(view ? view.id : null)
    onApply(view ? viewToPatch(view) : EMPTY_PATCH)
    setOpen(false)
  }

  const currentAsPayload = (name) => ({
    name,
    search: currentState.search || null,
    date_from: currentState.dateFrom || null,
    date_to: currentState.dateTo || null,
    conditions: currentState.conditions ?? [],
    visible_columns: currentState.visibleColumns ?? null,
  })

  const saveCurrentAsNew = () => {
    if (!nameInput.trim()) return
    create.mutate(currentAsPayload(nameInput.trim()), {
      onSuccess: (view) => { setActiveViewId(view.id); setSaveModal(false); setNameInput('') },
    })
  }

  const updateActiveView = () => {
    if (!activeView) return
    update.mutate({ id: activeView.id, data: currentAsPayload(activeView.name) })
  }

  const deleteActiveView = () => {
    if (!activeView) return
    remove.mutate(activeView.id)
    selectView(null)
  }

  const rowClass = (isActive) =>
    `w-full text-right px-4 py-2 text-sm transition-colors ${isActive ? 'bg-[#2398c2]/10 text-[#2398c2] font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`

  const rows = (
    <>
      <button type="button" onClick={() => selectView(null)} className={rowClass(!activeViewId)}>הכל</button>
      {views.map(v => (
        <button key={v.id} type="button" onClick={() => selectView(v)} className={rowClass(activeViewId === v.id)}>
          {v.name}{v.is_default ? ' ★' : ''}
        </button>
      ))}
      <button type="button" onClick={() => setSaveModal(true)} className="w-full text-right px-4 py-2 text-sm text-[#2398c2] hover:underline">
        + הוסף תצוגה
      </button>
    </>
  )

  const activeControls = activeView && (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs flex-wrap">
      <span className="text-gray-500 dark:text-gray-400">{activeView.name}{dirty ? ' (שונה, לא נשמר)' : ''}</span>
      {dirty && <button type="button" onClick={updateActiveView} className="text-[#2398c2] hover:underline">עדכן תצוגה</button>}
      {!activeView.is_default && <button type="button" onClick={() => setDefault.mutate(activeView.id)} className="text-gray-400 hover:text-gray-600">קבע כברירת מחדל</button>}
      <button type="button" onClick={deleteActiveView} className="text-red-400 hover:text-red-600">מחק</button>
    </div>
  )

  const saveModalUi = saveModal && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={() => setSaveModal(false)}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">שמירת תצוגה חדשה</h3>
        <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="שם התצוגה..."
          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4" />
        <div className="flex gap-2">
          <button type="button" onClick={saveCurrentAsNew} className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] text-white py-2 rounded-lg text-sm font-medium">שמור</button>
          <button type="button" onClick={() => setSaveModal(false)} className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
        </div>
      </div>
    </div>
  )

  if (layout === 'sidebar') {
    return (
      <>
        <nav className="py-1">{rows}</nav>
        {activeControls}
        {saveModalUi}
      </>
    )
  }

  return (
    <div className="relative" ref={barRef}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
        {activeView ? activeView.name : 'תצוגות'} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 w-56">
          {rows}
        </div>
      )}
      {activeControls}
      {saveModalUi}
    </div>
  )
}
