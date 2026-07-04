import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLeads, useCreateLead, useChangeLeadStage, useUpdateLead, useBulkLeadAction, useDeleteAllLeads } from '../../hooks/useLeads'
import { useQuery } from '@tanstack/react-query'
import { pipelineApi } from '../../api/pipeline'
import { customFieldsApi } from '../../api/customFields'
import { useAuth } from '../../context/AuthContext'
import { useLabels } from '../../context/LabelsContext'
import LeadPanel from './LeadPanel'

const SOURCES = ['', 'אתר', 'פייסבוק', 'גוגל', 'המלצה', 'אחר']
const EMPTY_FORM = { name: '', phone: '', email: '', source: '', pipeline_stage_id: '', notes: '' }

const ALL_COLS = [
  { key: 'name',        label: 'שם מלא',       always: true },
  { key: 'phone',       label: 'טלפון',         always: false },
  { key: 'email',       label: 'דוא"ל',         always: false },
  { key: 'stage',       label: 'סטטוס',         always: false },
  { key: 'source',      label: 'מקור',          always: false },
  { key: 'assigned_to', label: 'נציג אחראי',    always: false },
  { key: 'created_at',  label: 'תאריך יצירה',   always: false },
]

const DEFAULT_VISIBLE = { name: true, phone: true, email: true, stage: true, source: true, assigned_to: true, created_at: true }

const SAVED_VIEWS = [
  { id: 'all',      label: 'כל הלידים', filter: {} },
  { id: 'no_agent', label: 'ללא נציג',  filter: { no_agent: true } },
]

const COLS_VERSION = 'v3'
function loadCols() {
  try {
    const saved = JSON.parse(localStorage.getItem('crm_leads_cols') || 'null')
    if (!saved || saved._v !== COLS_VERSION) return { ...DEFAULT_VISIBLE, _v: COLS_VERSION }
    return saved
  } catch { return { ...DEFAULT_VISIBLE, _v: COLS_VERSION } }
}

function CopyEmailBtn({ email }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title={copied ? 'הועתק!' : email}
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(email).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="w-7 h-7 flex items-center justify-center rounded-lg text-[#2398c2] hover:bg-[#2398c2]/10 transition-colors"
    >
      {copied ? (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
        </svg>
      )}
    </button>
  )
}

export default function LeadsPage() {
  const { can } = useAuth()
  const { t } = useLabels()
  const [search, setSearch]       = useState('')
  const [stageFilter, setStage]   = useState('')
  const [showModal, setModal]     = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [error, setError]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [selected, setSelected]   = useState(new Set())
  const [panelId, setPanelId]     = useState(null)
  const [activeView, setView]     = useState('all')
  const [showCols, setShowCols]   = useState(false)
  const [visibleCols, setVisCols] = useState(loadCols)
  const colsRef = useRef(null)

  const viewFilter = SAVED_VIEWS.find(v => v.id === activeView)?.filter ?? {}

  const { data, isLoading } = useLeads({ search, stage_id: stageFilter })
  const createLead  = useCreateLead()
  const changeStage = useChangeLeadStage()
  const updateLead  = useUpdateLead()
  const bulkAction  = useBulkLeadAction()
  const deleteAll   = useDeleteAllLeads()

  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: () => pipelineApi.stages().then(r => r.data.data),
  })

  const { data: cfData } = useQuery({
    queryKey: ['custom-fields', 'leads'],
    queryFn:  () => customFieldsApi.list('leads').then(r => r.data.data),
    staleTime: 1000 * 60 * 5,
  })
  const customFieldDefs = (cfData ?? []).filter(f => !f.is_system && !f.hidden)

  // Merge static + custom columns
  const dynamicCols = [
    ...ALL_COLS,
    ...customFieldDefs.map(cf => ({ key: `cf_${cf.name}`, label: cf.label, always: false, cfName: cf.name })),
  ]

  const allLeads = data?.data ?? []
  const leads = allLeads.filter(l => {
    if (viewFilter.status && l.status !== viewFilter.status) return false
    if (viewFilter.no_agent && l.assigned_to != null) return false
    return true
  })
  const total = data?.total ?? 0
  const canEdit = can('leads', 'can_update')
  const navigate = useNavigate()

  useEffect(() => {
    localStorage.setItem('crm_leads_cols', JSON.stringify(visibleCols))
  }, [visibleCols])

  useEffect(() => {
    const handler = (e) => { if (colsRef.current && !colsRef.current.contains(e.target)) setShowCols(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleDeleteAll = async () => {
    const ok = window.prompt(`פעולה בלתי הפיכה! ימחקו כל ${total} ה${t('leads')}.\nהקלד "מחק" לאישור:`)
    if (ok !== 'מחק') return
    await deleteAll.mutateAsync()
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      await createLead.mutateAsync({ ...form, pipeline_stage_id: form.pipeline_stage_id || undefined })
      setForm(EMPTY_FORM); setModal(false)
    } catch (err) {
      setError(err.response?.data?.message ?? err.response?.data?.errors?.name?.[0] ?? 'שגיאה בשמירה')
    } finally { setSaving(false) }
  }

  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSelected(s => s.size === leads.length ? new Set() : new Set(leads.map(l => l.id)))
  const clearSel = () => setSelected(new Set())

  const runBulk = async (action, value) => {
    await bulkAction.mutateAsync({ action, ids: [...selected], value })
    clearSel()
  }

  const col = (key) => visibleCols[key] !== false

  // ── Inline cell editing ──────────────────────────────────────────────────
  // editCell: { id, field } — field is 'name'|'phone'|'email' or 'cf:<name>'
  const [editCell, setEditCell] = useState(null)
  const [draft, setDraft]       = useState('')

  const cellValue = (lead, field) =>
    field.startsWith('cf:') ? (lead.custom_fields?.[field.slice(3)] ?? '') : (lead[field] ?? '')

  const startEdit = (lead, field) => {
    if (!canEdit) return
    setDraft(String(cellValue(lead, field)))
    setEditCell({ id: lead.id, field })
  }

  const saveCell = (lead, field, value) => {
    setEditCell(null)
    if (String(cellValue(lead, field)) === String(value)) return
    const data = field.startsWith('cf:')
      ? { custom_fields: { ...(lead.custom_fields ?? {}), [field.slice(3)]: value } }
      : { [field]: value }
    updateLead.mutate({ id: lead.id, data })
  }

  const isEditing = (lead, field) => editCell?.id === lead.id && editCell?.field === field

  const editInput = (lead, field, { inputType = 'text', dir = 'auto' } = {}) => (
    <input autoFocus type={inputType} value={draft} dir={dir} lang={dir === 'auto' ? 'he' : undefined}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => saveCell(lead, field, draft)}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setEditCell(null)
      }}
      onClick={e => e.stopPropagation()}
      className="w-full min-w-[110px] border border-[#2398c2] rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30" />
  )

  const pencilBtn = (lead, field) => canEdit && (
    <button type="button" title="עריכה"
      onClick={e => { e.stopPropagation(); startEdit(lead, field) }}
      className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-gray-300 hover:text-[#2398c2] transition-opacity">
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
      </svg>
    </button>
  )

  return (
    <div className="flex gap-0 -m-6 min-h-screen" dir="rtl">

      {/* Right sidebar — saved views */}
      <aside className="w-44 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">תצוגות</span>
        </div>
        <nav className="py-1">
          {SAVED_VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`w-full text-right px-4 py-2.5 text-sm transition-colors ${activeView === v.id ? 'bg-[#2398c2]/10 text-[#2398c2] font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {v.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">{t('leads')}</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{total} {t('leads')} במערכת</p>
          </div>
          <div className="flex items-center gap-2">
            {can('leads', 'can_delete') && total > 0 && (
              <button onClick={handleDeleteAll} disabled={deleteAll.isPending}
                className="border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 px-3 py-2 rounded-lg text-sm transition-colors">
                מחק הכל
              </button>
            )}
            {can('leads', 'can_create') && (
              <button onClick={() => navigate('/import')}
                className="border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
                📥 ייבוא CSV
              </button>
            )}
            {can('leads', 'can_create') && (
              <button onClick={() => setModal(true)}
                className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors shadow-sm">
                + {t('lead')} חדש
              </button>
            )}
          </div>
        </div>

        {/* Filters row */}
        <div className="flex gap-2 px-5 pb-3">
          <input type="text" placeholder={`🔍  חיפוש...`}
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500" />
          <select value={stageFilter} onChange={e => setStage(e.target.value)}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]">
            <option value="">כל הסטטוסים</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {/* Column visibility */}
          <div className="relative" ref={colsRef}>
            <button onClick={() => setShowCols(s => !s)}
              className="border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
              עמודות ▾
            </button>
            {showCols && (
              <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 p-3 w-52 max-h-72 overflow-y-auto">
                {dynamicCols.filter(c => !c.always).map(c => (
                  <label key={c.key} className="flex items-center gap-2 py-1.5 cursor-pointer hover:text-[#2398c2]">
                    <input type="checkbox" checked={visibleCols[c.key] !== false}
                      onChange={e => setVisCols(v => ({ ...v, [c.key]: e.target.checked }))}
                      className="rounded border-gray-300 accent-[#2398c2]" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {c.label}
                      {c.cfName && <span className="text-xs text-gray-400 mr-1">*</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bulk toolbar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 mx-5 mb-2 bg-[#2398c2]/5 border border-[#2398c2]/20 rounded-lg px-4 py-2">
            <span className="text-sm font-medium text-[#2398c2]">{selected.size} נבחרו</span>
            <select onChange={e => { if (e.target.value) runBulk('change_stage', Number(e.target.value)); e.target.value = '' }}
              className="border border-[#2398c2]/20 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 dark:border-[#2398c2]/30" defaultValue="">
              <option value="" disabled>שנה שלב...</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {can('leads', 'can_delete') && (
              <button onClick={() => { if (confirm(`למחוק ${selected.size} ${t('leads')}?`)) runBulk('delete') }}
                className="text-sm text-red-500 hover:text-red-700 font-medium">מחק</button>
            )}
            <button onClick={clearSel} className="text-sm text-gray-400 mr-auto">בטל</button>
          </div>
        )}

        {/* Table — both axes scrollable, always-visible scrollbars */}
        <div className="px-5 pb-5">
          <div className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800" style={{ maxHeight: 'calc(100vh - 220px)' }}>
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 text-right">
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" checked={leads.length > 0 && selected.size === leads.length} onChange={toggleAll}
                      className="rounded border-gray-300 accent-[#2398c2]" />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('lead')}</th>
                  {col('phone')       && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">טלפון</th>}
                  {col('email')       && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">דוא"ל</th>}
                  {col('stage')       && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">סטטוס</th>}
                  {col('source')      && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">מקור</th>}
                  {col('assigned_to') && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">נציג</th>}
                  {col('created_at')  && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">תאריך</th>}
                  {customFieldDefs.filter(cf => col(`cf_${cf.name}`)).map(cf => (
                    <th key={cf.id} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{cf.label}</th>
                  ))}
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 z-20 bg-gray-50 dark:bg-gray-700 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.08)]">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">טוען...</td></tr>
                )}
                {!isLoading && leads.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    <div className="text-3xl mb-2">👥</div>
                    <div>אין {t('leads')} {activeView !== 'all' ? 'בתצוגה זו' : 'עדיין'}</div>
                  </td></tr>
                )}
                {leads.map(lead => (
                  <tr key={lead.id}
                    className={`border-b border-gray-100 dark:border-gray-700 transition-colors duration-100 group ${selected.has(lead.id) ? 'bg-[#2398c2]/5 dark:bg-[#2398c2]/10' : 'hover:bg-gray-50/80 dark:hover:bg-gray-700/30'}`}>
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)}
                        className="rounded border-gray-300 accent-[#2398c2]" />
                    </td>
                    {/* Name */}
                    <td className="px-4 py-2.5 cursor-pointer" onClick={() => setPanelId(lead.id)}>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: lead.stage?.color ?? '#2398c2' }}>
                          {lead.name?.trim()
                            ? lead.name.trim()[0].toUpperCase()
                            : <svg className="w-3.5 h-3.5 opacity-80" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                          }
                        </div>
                        {isEditing(lead, 'name')
                          ? editInput(lead, 'name')
                          : <>
                              <span className="font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{lead.name}</span>
                              {pencilBtn(lead, 'name')}
                            </>}
                      </div>
                    </td>
                    {/* Phone */}
                    {col('phone') && (
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap" dir="ltr">
                        {isEditing(lead, 'phone')
                          ? editInput(lead, 'phone', { inputType: 'tel', dir: 'ltr' })
                          : <span className="flex items-center gap-1.5">
                              {lead.phone
                                ? <a href={`tel:${lead.phone}`} className="text-gray-700 dark:text-gray-300 hover:text-[#2398c2]" onClick={e => e.stopPropagation()}>{lead.phone}</a>
                                : <span className="text-gray-300 dark:text-gray-600">—</span>}
                              {pencilBtn(lead, 'phone')}
                            </span>}
                      </td>
                    )}
                    {/* Email */}
                    {col('email') && (
                      <td className="px-4 py-2.5 max-w-[160px]">
                        {isEditing(lead, 'email')
                          ? editInput(lead, 'email', { inputType: 'email', dir: 'ltr' })
                          : <span className="flex items-center gap-1.5">
                              {lead.email
                                ? <span className="text-gray-600 dark:text-gray-400 truncate text-xs" dir="ltr">{lead.email}</span>
                                : <span className="text-gray-300 dark:text-gray-600">—</span>}
                              {pencilBtn(lead, 'email')}
                            </span>}
                      </td>
                    )}
                    {/* Stage — inline select */}
                    {col('stage') && (
                      <td className="px-4 py-2.5 w-[140px] max-w-[140px] overflow-hidden" onClick={e => e.stopPropagation()}>
                        {lead.stage ? (
                          <select value={lead.pipeline_stage_id ?? ''} disabled={!canEdit}
                            onChange={e => changeStage.mutate({ leadId: lead.id, stageId: Number(e.target.value) })}
                            className="inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 border cursor-pointer disabled:cursor-default appearance-none max-w-[130px] truncate"
                            style={{ backgroundColor: `${lead.stage.color}22`, color: lead.stage.color, borderColor: `${lead.stage.color}60` }}>
                            <option value="" className="text-gray-800 bg-white dark:bg-gray-800 dark:text-gray-100">ללא שלב</option>
                            {stages.map(s => <option key={s.id} value={s.id} className="text-gray-800 bg-white dark:bg-gray-800 dark:text-gray-100">{s.name}</option>)}
                          </select>
                        ) : (
                          <select value="" disabled={!canEdit}
                            onChange={e => changeStage.mutate({ leadId: lead.id, stageId: Number(e.target.value) })}
                            className="inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-pointer appearance-none">
                            <option value="" className="text-gray-800 bg-white dark:bg-gray-800 dark:text-gray-100">ללא שלב</option>
                            {stages.map(s => <option key={s.id} value={s.id} className="text-gray-800 bg-white dark:bg-gray-800 dark:text-gray-100">{s.name}</option>)}
                          </select>
                        )}
                      </td>
                    )}
                    {/* Source */}
                    {col('source') && (
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                        {lead.source || <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                    )}
                    {/* Agent */}
                    {col('assigned_to') && (
                      <td className="px-4 py-2.5 text-xs text-[#2398c2] whitespace-nowrap">
                        {lead.assigned_user?.name ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                    )}
                    {/* Date */}
                    {col('created_at') && (
                      <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap cursor-pointer" onClick={() => setPanelId(lead.id)}>
                        {new Date(lead.created_at).toLocaleDateString('he-IL')}
                      </td>
                    )}
                    {/* Custom fields */}
                    {customFieldDefs.filter(cf => col(`cf_${cf.name}`)).map(cf => {
                      const field = `cf:${cf.name}`
                      const val = lead.custom_fields?.[cf.name]
                      const empty = val === undefined || val === null || val === ''
                      return (
                        <td key={cf.id} className="px-4 py-2.5 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          {cf.field_type === 'checkbox' ? (
                            <input type="checkbox" checked={!!val} disabled={!canEdit}
                              onChange={e => saveCell(lead, field, e.target.checked)}
                              className="rounded border-gray-300 accent-[#2398c2] cursor-pointer" />
                          ) : cf.field_type === 'select' ? (
                            isEditing(lead, field) ? (
                              <select autoFocus value={draft}
                                onChange={e => saveCell(lead, field, e.target.value)}
                                onBlur={() => setEditCell(null)}
                                className="border border-[#2398c2] rounded-md px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none">
                                <option value="">—</option>
                                {(cf.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                {empty ? <span className="text-gray-300 dark:text-gray-600">—</span> : String(val)}
                                {pencilBtn(lead, field)}
                              </span>
                            )
                          ) : isEditing(lead, field) ? (
                            editInput(lead, field, {
                              inputType: { number: 'number', date: 'date', email: 'email', phone: 'tel', url: 'url' }[cf.field_type] ?? 'text',
                              dir: ['number', 'date', 'email', 'phone', 'url'].includes(cf.field_type) ? 'ltr' : 'auto',
                            })
                          ) : (
                            <span className="flex items-center gap-1.5">
                              {empty ? <span className="text-gray-300 dark:text-gray-600">—</span> : String(val)}
                              {pencilBtn(lead, field)}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    {/* Quick actions */}
                    <td className="px-4 py-2.5 sticky left-0 z-20 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.08)]" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {lead.phone ? (
                          <a
                            href={`https://wa.me/${lead.phone.replace(/\D/g, '').replace(/^0/, '972')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`WhatsApp ${lead.phone}`}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                          >
                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          </a>
                        ) : (
                          <span className="w-7 h-7" />
                        )}
                        {lead.email ? (
                          <CopyEmailBtn email={lead.email} />
                        ) : (
                          <span className="w-7 h-7" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Lead detail panel */}
      {panelId && <LeadPanel leadId={panelId} stages={stages} canEdit={canEdit} onClose={() => setPanelId(null)} />}

      {/* Add Lead Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={() => setModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('lead')} חדש</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
              {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">שם <span className="text-red-400">*</span></label>
                <input required value={form.name} onChange={set('name')} placeholder={`שם ה${t('lead')}`}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">טלפון</label>
                  <input value={form.phone} onChange={set('phone')} type="tel" placeholder="05X-XXXXXXX"
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">אימייל</label>
                  <input value={form.email} onChange={set('email')} type="email" placeholder="email@..."
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('source')}</label>
                  <select value={form.source} onChange={set('source')}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]">
                    {SOURCES.map(s => <option key={s} value={s}>{s || `בחר ${t('source')}`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('stage')}</label>
                  <select value={form.pipeline_stage_id} onChange={set('pipeline_stage_id')}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]">
                    <option value="">בחר {t('stage')}</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">הערות</label>
                <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="הערות נוספות..."
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {saving ? 'שומר...' : `הוסף ${t('lead')}`}
                </button>
                <button type="button" onClick={() => setModal(false)}
                  className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
