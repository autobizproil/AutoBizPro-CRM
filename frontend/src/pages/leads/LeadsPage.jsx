import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLeads, useCreateLead, useDeleteLead } from '../../hooks/useLeads'
import { usePipeline } from '../../hooks/usePipeline'
import { leadsApi } from '../../api/leads'
import { useAuth } from '../../context/AuthContext'
import LeadPanel from './LeadPanel'

function exportLeadsCsv(leads) {
  const COLS = ['id','name','phone','email','status','source','created_at']
  const rows = [COLS.join(','), ...leads.map(l =>
    COLS.map(k => {
      const v = k === 'created_at' ? (l[k] ? new Date(l[k]).toLocaleDateString('he-IL') : '') : (l[k] ?? '')
      return `"${String(v).replace(/"/g, '""')}"`
    }).join(',')
  )]
  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `leads-${Date.now()}.csv`; a.click()
  URL.revokeObjectURL(url)
}

function parseCsvLeads(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  return lines.slice(1).map(line => {
    const vals = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { vals.push(cur); cur = '' }
      else { cur += ch }
    }
    vals.push(cur)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? '' })
    return { name: obj.name || obj['שם'] || obj['שם מלא'] || '', phone: obj.phone || obj['טלפון'] || '', email: obj.email || obj['אימייל'] || obj['דוא"ל'] || '', source: obj.source || obj['מקור'] || '', status: 'new', id: Date.now() + Math.random(), created_at: new Date().toISOString() }
  }).filter(l => l.name)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  new:         'ליד חדש',
  contacted:   'יצרנו קשר',
  qualified:   'מתאים',
  proposal:    'הצעה נשלחה',
  closed_won:  'נסגר ✓',
  closed_lost: 'לא רלוונטי',
}

const STATUS_COLOR = {
  new:         'text-pink-500',
  contacted:   'text-blue-500',
  qualified:   'text-green-600',
  proposal:    'text-orange-500',
  closed_won:  'text-emerald-600 font-semibold',
  closed_lost: 'text-red-500',
}

const ALL_COLUMNS = [
  { key: 'name',        label: 'שם מלא',       defaultVisible: true  },
  { key: 'phone',       label: 'טלפון נייד',    defaultVisible: true  },
  { key: 'email',       label: 'דוא"ל',         defaultVisible: true  },
  { key: 'stage',       label: 'שלב',           defaultVisible: true  },
  { key: 'status',      label: 'סטטוס',         defaultVisible: true  },
  { key: 'source',      label: 'מקור הגעה',     defaultVisible: true  },
  { key: 'assigned_to', label: 'נציג אחראי',    defaultVisible: true  },
  { key: 'created_at',  label: 'תאריך יצירה',   defaultVisible: true  },
  { key: 'notes',       label: 'הערות',         defaultVisible: false },
]

const SAVED_VIEWS = [
  { id: 'all',          label: '★ כל הלידים',    filter: {} },
  { id: 'new',          label: 'לידים חדשים',    filter: { status: 'new' } },
  { id: 'no_agent',     label: 'ללא נציג',       filter: { assigned_to: 'null' } },
  { id: 'closed_won',   label: 'נסגרו',          filter: { status: 'closed_won' } },
  { id: 'closed_lost',  label: 'לא רלוונטי',    filter: { status: 'closed_lost' } },
]

const LS_KEY = 'crm_leads_columns'

function getDefaultVisibility() {
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.defaultVisible]))
}

function formatDate(dt) {
  if (!dt) return '—'
  const d = new Date(dt)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { can }                         = useAuth()
  const qc                              = useQueryClient()

  // Filters & search
  const [search, setSearch]             = useState('')
  const [viewFilter, setViewFilter]     = useState({})
  const [activeView, setActiveView]     = useState('all')

  // Data
  const filters = { search, ...viewFilter }
  const { data, isLoading }             = useLeads(filters)
  const { data: stages = [] }           = usePipeline()
  const createLead                      = useCreateLead()
  const deleteLead                      = useDeleteLead()

  const leads = data?.data ?? []

  // Create form
  const [showForm, setShowForm]         = useState(false)
  const [form, setForm]                 = useState({ name: '', phone: '', email: '', source: '' })

  // Bulk select
  const [selected, setSelected]         = useState(new Set())

  // Lead panel (slide-over)
  const [panelLeadId, setPanelLeadId]   = useState(null)

  // Inline editing
  const [editingCell, setEditingCell]   = useState(null) // { leadId, field }

  // Column visibility
  const [colVis, setColVis]             = useState(getDefaultVisibility)
  const [showColPanel, setShowColPanel] = useState(false)
  const colPanelRef                     = useRef(null)

  // Import
  const importRef                       = useRef(null)

  // Right sidebar
  const [sidebarOpen, setSidebarOpen]   = useState(true)

  // Persist column visibility
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(colVis)) } catch {}
  }, [colVis])

  // Close col panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target)) {
        setShowColPanel(false)
      }
    }
    if (showColPanel) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColPanel])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCreate = async (e) => {
    e.preventDefault()
    await createLead.mutateAsync(form)
    setForm({ name: '', phone: '', email: '', source: '' })
    setShowForm(false)
  }

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(leads.map(l => l.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (!window.confirm(`למחוק ${selected.size} לידים?`)) return
    for (const id of selected) {
      deleteLead.mutate(id)
    }
    setSelected(new Set())
  }

  const handleDeleteAll = async () => {
    if (!window.confirm(`למחוק את כל ${leads.length} הלידים? פעולה זו אינה הפיכה.`)) return
    for (const l of leads) {
      deleteLead.mutate(l.id)
    }
    setSelected(new Set())
  }

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const imported = parseCsvLeads(ev.target.result)
      if (!imported.length) { alert('לא נמצאו לידים תקינים בקובץ'); return }
      qc.setQueriesData({ queryKey: ['leads'] }, (old) => {
        const existing = old?.data ?? []
        return { data: [...imported, ...existing] }
      })
      alert(`יובאו ${imported.length} לידים`)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const startEdit = (leadId, field, e) => {
    e.stopPropagation()
    setEditingCell({ leadId, field })
  }

  const commitEdit = async (leadId, field, value) => {
    setEditingCell(null)
    if (!value && field === 'pipeline_stage_id') {
      await leadsApi.update(leadId, { pipeline_stage_id: null })
    } else {
      await leadsApi.update(leadId, { [field]: value || null })
    }
    qc.invalidateQueries({ queryKey: ['leads'] })
  }

  const cancelEdit = () => setEditingCell(null)

  const handleViewClick = (view) => {
    setActiveView(view.id)
    setViewFilter(view.filter)
    setSelected(new Set())
  }

  const toggleCol = (key) => {
    setColVis(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const visibleCols = ALL_COLUMNS.filter(c => colVis[c.key])

  // ── Render helpers ───────────────────────────────────────────────────────────

  const renderStageCell = (lead) => {
    const isEditing = editingCell?.leadId === lead.id && editingCell?.field === 'pipeline_stage_id'

    if (isEditing) {
      return (
        <select
          autoFocus
          defaultValue={lead.pipeline_stage_id ?? ''}
          className="border border-gray-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#2398c2] max-w-[140px]"
          onChange={e => commitEdit(lead.id, 'pipeline_stage_id', e.target.value)}
          onBlur={cancelEdit}
          onKeyDown={e => e.key === 'Escape' && cancelEdit()}
        >
          <option value="">ללא שלב</option>
          {stages.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )
    }

    return (
      <div className="flex items-center gap-1 group/cell">
        {lead.stage ? (
          <span
            className="px-2 py-0.5 rounded text-xs text-white leading-tight"
            style={{ backgroundColor: lead.stage.color ?? '#6b7280' }}
          >
            {lead.stage.name}
          </span>
        ) : (
          <span className="flex items-center justify-center text-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-400 leading-tight min-w-[56px]">
            ללא שלב
          </span>
        )}
        <button
          className="opacity-0 group-hover/cell:opacity-100 text-gray-400 hover:text-gray-600 text-xs transition-opacity"
          onClick={e => startEdit(lead.id, 'pipeline_stage_id', e)}
          title="ערוך שלב"
        >
          ✏️
        </button>
      </div>
    )
  }

  const renderStatusCell = (lead) => {
    const isEditing = editingCell?.leadId === lead.id && editingCell?.field === 'status'

    if (isEditing) {
      return (
        <select
          autoFocus
          defaultValue={lead.status ?? ''}
          className="border border-gray-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#2398c2] max-w-[140px]"
          onChange={e => commitEdit(lead.id, 'status', e.target.value)}
          onBlur={cancelEdit}
          onKeyDown={e => e.key === 'Escape' && cancelEdit()}
        >
          <option value="">— ללא —</option>
          {Object.entries(STATUS_LABELS).map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </select>
      )
    }

    return (
      <div className="flex items-center gap-1 group/cell">
        <span className={`text-xs ${STATUS_COLOR[lead.status] ?? 'text-gray-400'}`}>
          {STATUS_LABELS[lead.status] ?? lead.status ?? '—'}
        </span>
        <button
          className="opacity-0 group-hover/cell:opacity-100 text-gray-400 hover:text-gray-600 text-xs transition-opacity"
          onClick={e => startEdit(lead.id, 'status', e)}
          title="ערוך סטטוס"
        >
          ✏️
        </button>
      </div>
    )
  }

  const renderCell = (lead, col) => {
    switch (col.key) {
      case 'name':
        return (
          <button
            className="font-semibold text-gray-900 hover:text-[#2398c2] transition-colors text-right"
            onClick={() => setPanelLeadId(lead.id)}
          >
            {lead.name}
          </button>
        )
      case 'phone':
        return <span dir="ltr" className="text-gray-600">{lead.phone ?? '—'}</span>
      case 'email':
        return <span className="text-gray-600 truncate block max-w-[160px]">{lead.email ?? '—'}</span>
      case 'stage':
        return renderStageCell(lead)
      case 'status':
        return renderStatusCell(lead)
      case 'source':
        return <span className="text-gray-600">{lead.source ?? '—'}</span>
      case 'assigned_to':
        return (
          <span className="text-[#2398c2]">
            {lead.assigned_user?.name ?? '—'}
          </span>
        )
      case 'created_at':
        return <span className="text-gray-500 text-xs whitespace-nowrap">{formatDate(lead.created_at)}</span>
      case 'notes':
        return (
          <span className="text-gray-500 text-xs">
            {lead.notes ? lead.notes.slice(0, 40) + (lead.notes.length > 40 ? '…' : '') : '—'}
          </span>
        )
      default:
        return null
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-0 h-full" dir="rtl">

      {/* ── Main area ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold text-gray-900">לידים</h2>
          <div className="flex items-center gap-2 flex-wrap">

            {/* Column visibility button */}
            <div className="relative" ref={colPanelRef}>
              <button
                onClick={() => setShowColPanel(v => !v)}
                className="flex items-center gap-1 border border-gray-300 bg-white text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                עמודות ⌄
              </button>
              {showColPanel && (
                <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-30 p-3 min-w-[170px]">
                  {ALL_COLUMNS.map(col => (
                    <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm text-gray-700 hover:text-gray-900">
                      <input
                        type="checkbox"
                        checked={!!colVis[col.key]}
                        onChange={() => toggleCol(col.key)}
                        className="accent-[#2398c2]"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Import CSV */}
            <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
            <button
              onClick={() => importRef.current?.click()}
              className="flex items-center gap-1 border border-gray-300 bg-white text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              ↑ ייבא CSV
            </button>

            {/* Export CSV */}
            <button
              onClick={() => exportLeadsCsv(leads)}
              className="flex items-center gap-1 border border-gray-300 bg-white text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              ↓ ייצוא CSV
            </button>

            {/* Delete all */}
            {can('leads', 'can_delete') && leads.length > 0 && (
              <button
                onClick={handleDeleteAll}
                className="flex items-center gap-1 border border-red-200 bg-white text-red-500 px-3 py-1.5 rounded-lg text-sm hover:bg-red-50 transition-colors"
              >
                מחק הכל
              </button>
            )}

            {/* Search */}
            <input
              type="text"
              placeholder="חיפוש..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2] w-56"
            />

            {/* New lead */}
            {can('leads', 'can_create') && (
              <button
                onClick={() => setShowForm(true)}
                className="bg-[#2398c2] text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-[#1d7fa3] transition-colors"
              >
                + ליד חדש
              </button>
            )}
          </div>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
            <h3 className="font-semibold text-gray-800">ליד חדש</h3>
            {[['name','שם *'],['phone','טלפון'],['email','אימייל'],['source','מקור']].map(([k, label]) => (
              <input
                key={k}
                placeholder={label}
                value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                required={k === 'name'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            ))}
            <div className="flex gap-2">
              <button type="submit" className="bg-[#2398c2] text-white px-4 py-2 rounded-lg text-sm">שמור</button>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 text-sm px-3 py-2">ביטול</button>
            </div>
          </form>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 bg-[#2398c2]/10 border border-[#2398c2]/20 rounded-lg px-4 py-2 mb-3 text-sm">
            <span className="text-[#2398c2] font-medium">נבחרו {selected.size} לידים</span>
            {can('leads', 'can_delete') && (
              <button
                onClick={handleBulkDelete}
                className="text-red-500 hover:text-red-700 font-medium"
              >
                מחק נבחרים
              </button>
            )}
            <button
              onClick={() => setSelected(new Set())}
              className="text-gray-500 hover:text-gray-700 mr-auto"
            >
              ביטול בחירה
            </button>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="text-gray-500 text-sm py-8 text-center">טוען...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {/* Checkbox col */}
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={leads.length > 0 && selected.size === leads.length}
                        onChange={toggleSelectAll}
                        className="accent-[#2398c2]"
                      />
                    </th>
                    {visibleCols.map(col => (
                      <th
                        key={col.key}
                        className="text-right px-3 py-2 font-medium text-gray-500 text-xs whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                    {/* Actions col */}
                    <th className="px-3 py-2 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={visibleCols.length + 2} className="text-center text-gray-400 py-10 text-sm">
                        לא נמצאו לידים
                      </td>
                    </tr>
                  ) : (
                    leads.map(lead => (
                      <tr
                        key={lead.id}
                        className={`group hover:bg-gray-50 transition-colors ${selected.has(lead.id) ? 'bg-blue-50' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-2 w-8">
                          <input
                            type="checkbox"
                            checked={selected.has(lead.id)}
                            onChange={() => toggleSelect(lead.id)}
                            className="accent-[#2398c2]"
                          />
                        </td>
                        {/* Data cells */}
                        {visibleCols.map(col => (
                          <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                            {renderCell(lead, col)}
                          </td>
                        ))}
                        {/* Delete action */}
                        <td className="px-3 py-2 w-12">
                          {can('leads', 'can_delete') && (
                            <button
                              onClick={() => deleteLead.mutate(lead.id)}
                              className="text-red-400 hover:text-red-600 text-xs opacity-0 group-hover:opacity-100"
                              title="מחק"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Right sidebar — saved views ────────────────────────────────── */}
      <div className={`flex-shrink-0 transition-all duration-200 ${sidebarOpen ? 'w-52' : 'w-8'} border-r border-gray-200 bg-white mr-3 rounded-xl overflow-hidden flex flex-col`}>

        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="flex items-center justify-center w-full py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-b border-gray-100 text-xs transition-colors"
          title={sidebarOpen ? 'סגור פאנל' : 'פתח פאנל'}
        >
          {sidebarOpen ? '←' : '→'}
        </button>

        {sidebarOpen && (
          <>
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
              תצוגות שמורות
            </div>
            <nav className="flex-1 p-2 space-y-0.5">
              {SAVED_VIEWS.map(view => (
                <button
                  key={view.id}
                  onClick={() => handleViewClick(view)}
                  className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeView === view.id
                      ? 'text-[#2398c2] font-medium bg-[#2398c2]/8'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </nav>
          </>
        )}
      </div>

      {/* Lead panel slide-over */}
      {panelLeadId && (
        <LeadPanel
          leadId={panelLeadId}
          onClose={() => setPanelLeadId(null)}
        />
      )}
    </div>
  )
}
