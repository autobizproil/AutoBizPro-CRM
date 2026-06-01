import { useState, useEffect, useRef } from 'react'
import WidgetCard from './WidgetCard'
import AddWidgetModal from './AddWidgetModal'
import { dashboardApi } from '../../api/dashboard'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function monthAgoStr() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

function makeId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ── Default board seed ────────────────────────────────────────────────────────

const DEFAULT_BOARDS = [
  {
    id: 'default',
    name: 'ניתוח לידים',
    widgets: [
      { id: 'w1', type: 'kpi',   dataSource: 'kpi_total',      title: 'סה״כ לידים',    color: '#6366f1' },
      { id: 'w2', type: 'kpi',   dataSource: 'kpi_new',        title: 'לידים היום',    color: '#10b981' },
      { id: 'w3', type: 'kpi',   dataSource: 'kpi_open',       title: 'לידים פתוחים', color: '#f59e0b' },
      { id: 'w4', type: 'kpi',   dataSource: 'kpi_contacts',   title: 'אנשי קשר',      color: '#3b82f6' },
      { id: 'w5', type: 'pie',   dataSource: 'leads_by_source', title: 'לידים לפי מקור הגעה' },
      { id: 'w6', type: 'bar',   dataSource: 'leads_by_agent', title: 'לידים לפי נציג' },
      { id: 'w7', type: 'line',  dataSource: 'timeline',       title: 'לידים לאורך זמן' },
      { id: 'w8', type: 'bar_h', dataSource: 'activities',     title: 'פעילויות לפי סוג' },
      { id: 'w9', type: 'bar',   dataSource: 'conversion',     title: 'משפך המרה' },
    ],
  },
]

// ── localStorage persistence ──────────────────────────────────────────────────

const STORAGE_KEY = 'crm_boards_v2'

function loadBoards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // ignore
  }
  return DEFAULT_BOARDS
}

function saveBoards(boards) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards))
  } catch {
    // ignore
  }
}

// ── Inline-rename board button ────────────────────────────────────────────────

function BoardItem({ board, isActive, onClick, onRename }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(board.name)
  const inputRef              = useRef(null)

  function startEdit(e) {
    e.stopPropagation()
    setDraft(board.name)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit() {
    const name = draft.trim()
    if (name && name !== board.name) onRename(board.id, name)
    setEditing(false)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <div className="px-2 py-1.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="w-full border border-indigo-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
    )
  }

  return (
    <button
      onClick={onClick}
      onDoubleClick={startEdit}
      title="לחץ פעמיים לשינוי שם"
      className={`w-full text-right px-4 py-2.5 text-sm transition-colors ${
        isActive
          ? 'bg-indigo-50 text-indigo-700 font-medium'
          : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      {board.name}
    </button>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardsPage() {
  const [boards, setBoards]         = useState(loadBoards)
  const [activeBoardId, setActive]  = useState(() => loadBoards()[0]?.id ?? 'default')
  const [showAddWidget, setShowAdd] = useState(false)
  const [dateFrom, setDateFrom]     = useState(monthAgoStr)
  const [dateTo, setDateTo]         = useState(todayStr)

  const activeBoard = boards.find(b => b.id === activeBoardId) ?? boards[0]
  const dateParams  = { date_from: dateFrom, date_to: dateTo }

  // Persist on every change
  useEffect(() => {
    saveBoards(boards)
  }, [boards])

  // ── Boards CRUD ─────────────────────────────────────────────────────────────

  function addBoard() {
    const newBoard = { id: makeId(), name: 'לוח בקרה חדש', widgets: [] }
    setBoards(prev => [...prev, newBoard])
    setActive(newBoard.id)
  }

  function renameBoard(id, name) {
    setBoards(prev => prev.map(b => b.id === id ? { ...b, name } : b))
  }

  // ── Widget CRUD ─────────────────────────────────────────────────────────────

  function handleAddWidget(widgetConfig) {
    const widget = { ...widgetConfig, id: makeId() }
    setBoards(prev => prev.map(b =>
      b.id === activeBoardId
        ? { ...b, widgets: [...b.widgets, widget] }
        : b
    ))
    setShowAdd(false)
  }

  function handleDeleteWidget(widgetId) {
    setBoards(prev => prev.map(b =>
      b.id === activeBoardId
        ? { ...b, widgets: b.widgets.filter(w => w.id !== widgetId) }
        : b
    ))
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  function handleExport() {
    dashboardApi.exportLeads(dateParams)
      .then(r => {
        const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv;charset=utf-8;' }))
        const a = document.createElement('a')
        a.href = url
        a.download = `leads_export_${dateFrom}_${dateTo}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      })
      .catch(() => alert('שגיאה בייצוא הנתונים'))
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const kpiWidgets   = activeBoard?.widgets?.filter(w => w.type === 'kpi')  ?? []
  const chartWidgets = activeBoard?.widgets?.filter(w => w.type !== 'kpi')  ?? []

  return (
    <div dir="rtl" className="flex" style={{ height: 'calc(100vh - 0px)', minHeight: 0 }}>

      {/* ── Main board area ── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* Top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{activeBoard?.name ?? 'לוח בקרה'}</h2>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date range */}
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
              <label className="text-xs text-gray-500 whitespace-nowrap">מתאריך</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="text-xs text-gray-700 outline-none bg-transparent"
              />
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
              <label className="text-xs text-gray-500 whitespace-nowrap">עד תאריך</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="text-xs text-gray-700 outline-none bg-transparent"
              />
            </div>
            {/* Export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-2 rounded-xl shadow-sm transition-colors"
            >
              <span>📥</span>
              ייצוא CSV
            </button>
            {/* Add widget */}
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium px-3 py-2 rounded-xl shadow-sm transition-colors"
            >
              <span>＋</span>
              הוסף Widget
            </button>
          </div>
        </div>

        {/* KPI row */}
        {kpiWidgets.length > 0 && (
          <div className="flex flex-wrap gap-4 mb-6">
            {kpiWidgets.map(widget => (
              <WidgetCard
                key={widget.id}
                widget={widget}
                onDelete={() => handleDeleteWidget(widget.id)}
                dateParams={dateParams}
              />
            ))}
          </div>
        )}

        {/* Chart grid */}
        {chartWidgets.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {chartWidgets.map(widget => (
              <WidgetCard
                key={widget.id}
                widget={widget}
                onDelete={() => handleDeleteWidget(widget.id)}
                dateParams={dateParams}
              />
            ))}
          </div>
        ) : (
          !kpiWidgets.length && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-sm">לוח ריק — לחץ על "הוסף Widget" כדי להתחיל</p>
            </div>
          )
        )}
      </div>

      {/* ── Right sidebar ── */}
      <aside className="w-52 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
          לוחות בקרה
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {boards.map(board => (
            <BoardItem
              key={board.id}
              board={board}
              isActive={board.id === activeBoardId}
              onClick={() => setActive(board.id)}
              onRename={renameBoard}
            />
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <button
            onClick={addBoard}
            className="w-full text-sm text-indigo-600 hover:text-indigo-800 text-right py-1 transition-colors"
          >
            + הוסף לוח בקרה
          </button>
        </div>
      </aside>

      {/* ── Add Widget Modal ── */}
      {showAddWidget && (
        <AddWidgetModal
          onSave={handleAddWidget}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
