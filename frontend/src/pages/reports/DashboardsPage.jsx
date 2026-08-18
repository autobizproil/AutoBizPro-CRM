import { useState, useEffect, useRef } from 'react'
import WidgetCard from './WidgetCard'
import AddWidgetModal from './AddWidgetModal'
import { dashboardApi } from '../../api/dashboard'
import { useToast } from '../../context/ToastContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Server persistence, with a one-time localStorage upload ────────────────────

const STORAGE_KEY = 'crm_boards_v2'

// Normalizes a server board (widgets carry {id, config, position}) into the
// flat shape the rest of this file already works with ({id, name, widgets: [widgetConfig, ...]}),
// where each widget object keeps its server `id` merged into its own config.
function fromServerBoard(board) {
  return {
    id:   board.id,
    name: board.name,
    widgets: (board.widgets ?? []).map(w => ({ ...w.config, id: w.id })),
  }
}

async function migrateLocalStorageIfNeeded() {
  let localBoards = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) localBoards = parsed
    }
  } catch {
    return
  }
  if (!localBoards) return

  const existing = await dashboardApi.listBoards()
  if (existing.data.data.length > 0) {
    // Server already has boards (e.g. migrated from another browser) — don't duplicate.
    localStorage.removeItem(STORAGE_KEY)
    return
  }

  for (const board of localBoards) {
    const created = await dashboardApi.createBoard(board.name)
    const boardId = created.data.data.id
    for (const widget of board.widgets ?? []) {
      const { id: _localId, ...config } = widget
      await dashboardApi.createWidget(boardId, config)
    }
  }
  localStorage.removeItem(STORAGE_KEY)
}

// ── Inline-rename board button ────────────────────────────────────────────────

function BoardItem({ board, isActive, onClick, onRename, onDelete, onDuplicate, canDelete }) {
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
          className="w-full border border-[#2398c2] rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30"
        />
      </div>
    )
  }

  return (
    <div
      className={`group flex items-center gap-1 px-2 transition-colors ${
        isActive ? 'bg-[#2398c2]/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
    >
      <button
        onClick={onClick}
        onDoubleClick={startEdit}
        title="לחץ פעמיים לשינוי שם"
        className={`flex-1 text-right py-2.5 text-sm truncate ${
          isActive ? 'text-[#2398c2] font-medium' : 'text-gray-600 dark:text-gray-400'
        }`}
      >
        {board.name}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDuplicate(board.id) }}
        title="שכפל לוח"
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-[#2398c2] text-xs flex-shrink-0 transition-opacity"
      >⧉</button>
      {canDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(board.id) }}
          title="מחק לוח"
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-base leading-none flex-shrink-0 transition-opacity"
        >×</button>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardsPage() {
  const toast                       = useToast()
  const [boards, setBoards]         = useState([])
  const [activeBoardId, setActive]  = useState(null)
  const [showAddWidget, setShowAdd] = useState(false)
  const [loaded, setLoaded]         = useState(false)

  const activeBoard = boards.find(b => b.id === activeBoardId) ?? boards[0]
  // No global range — all time by default; each widget carries its own filter.
  const dateParams  = {}

  async function refreshBoards(preferredActiveId) {
    const resp = await dashboardApi.listBoards()
    let serverBoards = resp.data.data.map(fromServerBoard)

    if (serverBoards.length === 0) {
      // Brand-new tenant/user with nothing migrated and nothing created yet — seed
      // the same starter board P1 used to ship via DEFAULT_BOARDS, but through the API.
      for (const seed of DEFAULT_BOARDS) {
        const created = await dashboardApi.createBoard(seed.name)
        const boardId = created.data.data.id
        for (const widget of seed.widgets) {
          const { id: _localId, ...config } = widget
          await dashboardApi.createWidget(boardId, config)
        }
      }
      const reseeded = await dashboardApi.listBoards()
      serverBoards = reseeded.data.data.map(fromServerBoard)
    }

    setBoards(serverBoards)
    setActive(preferredActiveId && serverBoards.some(b => b.id === preferredActiveId)
      ? preferredActiveId
      : serverBoards[0]?.id ?? null)
  }

  useEffect(() => {
    migrateLocalStorageIfNeeded()
      .catch(() => { /* migration is best-effort; a failed upload just leaves the old localStorage data in place for a retry next load */ })
      .finally(() => refreshBoards().finally(() => setLoaded(true)))
  }, [])

  // ── Boards CRUD ─────────────────────────────────────────────────────────────

  async function addBoard() {
    const created = await dashboardApi.createBoard('לוח בקרה חדש')
    await refreshBoards(created.data.data.id)
  }

  async function renameBoard(id, name) {
    await dashboardApi.updateBoard(id, name)
    await refreshBoards(activeBoardId)
  }

  async function deleteBoard(id) {
    const board = boards.find(b => b.id === id)
    if (!board) return
    if (boards.length <= 1) { toast.error('חייב להישאר לפחות לוח אחד'); return }
    if (!confirm(`למחוק את הלוח "${board.name}"? הפעולה אינה הפיכה.`)) return
    await dashboardApi.deleteBoard(id)
    await refreshBoards()
  }

  async function duplicateBoard(id) {
    const board = boards.find(b => b.id === id)
    if (!board) return
    const created = await dashboardApi.createBoard(`${board.name} (עותק)`)
    const boardId = created.data.data.id
    for (const widget of board.widgets) {
      const { id: _oldId, ...config } = widget
      await dashboardApi.createWidget(boardId, config)
    }
    await refreshBoards(boardId)
  }

  // ── Widget CRUD ─────────────────────────────────────────────────────────────

  async function handleAddWidget(widgetConfig) {
    await dashboardApi.createWidget(activeBoardId, widgetConfig)
    setShowAdd(false)
    await refreshBoards(activeBoardId)
  }

  async function handleDeleteWidget(widgetId) {
    await dashboardApi.deleteWidget(activeBoardId, widgetId)
    await refreshBoards(activeBoardId)
  }

  async function handleUpdateWidget(widgetId, patch) {
    const widget = activeBoard.widgets.find(w => w.id === widgetId)
    if (!widget) return
    const { id: _id, ...config } = { ...widget, ...patch }
    await dashboardApi.updateWidget(activeBoardId, widgetId, config)
    await refreshBoards(activeBoardId)
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  function handleExport() {
    dashboardApi.exportLeads(dateParams)
      .then(r => {
        const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv;charset=utf-8;' }))
        const a = document.createElement('a')
        a.href = url
        a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      })
      .catch(() => toast.error('שגיאה בייצוא הנתונים'))
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!loaded) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">טוען לוחות בקרה...</div>
  }

  const kpiWidgets   = activeBoard?.widgets?.filter(w => w.type === 'kpi' || w.type === 'metrics_table')  ?? []
  const chartWidgets = activeBoard?.widgets?.filter(w => w.type !== 'kpi' && w.type !== 'metrics_table')  ?? []

  return (
    <div dir="rtl" className="flex" style={{ height: 'calc(100vh - 0px)', minHeight: 0 }}>

      {/* ── Main board area ── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* Top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{activeBoard?.name ?? 'לוח בקרה'}</h2>

          <div className="flex flex-wrap items-center gap-2">
            {/* Export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium px-3 py-2 rounded-xl shadow-sm transition-colors"
            >
              <span>📥</span>
              ייצוא CSV
            </button>
            {/* Add widget */}
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 bg-[#b1e239] hover:bg-[#9ecf30] text-gray-900 text-xs font-medium px-3 py-2 rounded-xl shadow-sm transition-colors"
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
                onUpdate={handleUpdateWidget}
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
      <aside className="w-52 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200">
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
              onDelete={deleteBoard}
              onDuplicate={duplicateBoard}
              canDelete={boards.length > 1}
            />
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={addBoard}
            className="w-full text-sm text-[#2398c2] hover:text-[#1d7fa3] text-right py-1 transition-colors"
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
