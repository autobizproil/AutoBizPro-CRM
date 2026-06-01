import { useState, useEffect, useRef } from 'react'
import { useLeads, useCreateLead, useChangeLeadStage, useUpdateLead, useBulkLeadAction, useDeleteAllLeads } from '../../hooks/useLeads'
import { useQuery } from '@tanstack/react-query'
import { pipelineApi } from '../../api/pipeline'
import { useAuth } from '../../context/AuthContext'
import { useLabels } from '../../context/LabelsContext'
import LeadPanel from './LeadPanel'

const SOURCES = ['', 'אתר', 'פייסבוק', 'גוגל', 'המלצה', 'אחר']
const EMPTY_FORM = { name: '', phone: '', email: '', source: '', pipeline_stage_id: '', notes: '' }

const STATUS_LABELS = {
  new: 'ליד חדש', contacted: 'יצרנו קשר', qualified: 'מתאים',
  proposal: 'הצעה נשלחה', closed_won: 'נסגר ✓', closed_lost: 'לא רלוונטי',
}
const STATUS_COLORS = {
  new: 'text-pink-500', contacted: 'text-blue-500', qualified: 'text-green-600',
  proposal: 'text-orange-500', closed_won: 'text-emerald-600 font-semibold', closed_lost: 'text-red-500',
}

const ALL_COLS = [
  { key: 'name',        label: 'שם מלא',       always: true },
  { key: 'phone',       label: 'טלפון',         always: false },
  { key: 'email',       label: 'דוא"ל',         always: false },
  { key: 'stage',       label: 'שלב',           always: false },
  { key: 'status',      label: 'סטטוס',         always: false },
  { key: 'source',      label: 'מקור',          always: false },
  { key: 'assigned_to', label: 'נציג אחראי',    always: false },
  { key: 'created_at',  label: 'תאריך יצירה',   always: false },
]

const DEFAULT_VISIBLE = { name: true, phone: true, email: true, stage: true, status: true, source: true, assigned_to: true, created_at: true }

const SAVED_VIEWS = [
  { id: 'all',         label: 'כל הלידים',    filter: {} },
  { id: 'new',         label: 'לידים חדשים',  filter: { status: 'new' } },
  { id: 'no_agent',    label: 'ללא נציג',      filter: { no_agent: true } },
  { id: 'closed_won',  label: 'נסגרו ✓',       filter: { status: 'closed_won' } },
  { id: 'closed_lost', label: 'לא רלוונטי',   filter: { status: 'closed_lost' } },
]

function loadCols() {
  try { return JSON.parse(localStorage.getItem('crm_leads_cols') || 'null') ?? DEFAULT_VISIBLE } catch { return DEFAULT_VISIBLE }
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
  const [editingStatus, setEditSt]= useState(null) // { leadId }
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

  const allLeads = data?.data ?? []
  const leads = allLeads.filter(l => {
    if (viewFilter.status && l.status !== viewFilter.status) return false
    if (viewFilter.no_agent && l.assigned_to != null) return false
    return true
  })
  const total = data?.total ?? 0
  const canEdit = can('leads', 'can_update')

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

  return (
    <div className="flex gap-0 -m-6 min-h-screen" dir="rtl">

      {/* Right sidebar — saved views */}
      <aside className="w-44 flex-shrink-0 border-l border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">תצוגות</span>
        </div>
        <nav className="py-1">
          {SAVED_VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`w-full text-right px-4 py-2.5 text-sm transition-colors ${activeView === v.id ? 'bg-[#2398c2]/10 text-[#2398c2] font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
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
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{t('leads')}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{total} {t('leads')} במערכת</p>
          </div>
          <div className="flex items-center gap-2">
            {can('leads', 'can_delete') && total > 0 && (
              <button onClick={handleDeleteAll} disabled={deleteAll.isPending}
                className="border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 px-3 py-2 rounded-lg text-sm transition-colors">
                מחק הכל
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
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2] bg-white" />
          <select value={stageFilter} onChange={e => setStage(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]">
            <option value="">כל השלבים</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {/* Column visibility */}
          <div className="relative" ref={colsRef}>
            <button onClick={() => setShowCols(s => !s)}
              className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
              עמודות ▾
            </button>
            {showCols && (
              <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-3 w-44">
                {ALL_COLS.filter(c => !c.always).map(c => (
                  <label key={c.key} className="flex items-center gap-2 py-1.5 cursor-pointer hover:text-[#2398c2]">
                    <input type="checkbox" checked={visibleCols[c.key] !== false}
                      onChange={e => setVisCols(v => ({ ...v, [c.key]: e.target.checked }))}
                      className="rounded border-gray-300 accent-[#2398c2]" />
                    <span className="text-sm text-gray-700">{c.label}</span>
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
              className="border border-[#2398c2]/20 rounded-lg px-2 py-1 text-sm bg-white" defaultValue="">
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
          <div className="overflow-auto rounded-xl border border-gray-200 shadow-sm bg-white" style={{ maxHeight: 'calc(100vh - 220px)' }}>
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200 text-right">
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" checked={leads.length > 0 && selected.size === leads.length} onChange={toggleAll}
                      className="rounded border-gray-300 accent-[#2398c2]" />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{t('lead')}</th>
                  {col('phone')       && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">טלפון</th>}
                  {col('email')       && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">דוא"ל</th>}
                  {col('stage')       && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">שלב</th>}
                  {col('status')      && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">סטטוס</th>}
                  {col('source')      && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">מקור</th>}
                  {col('assigned_to') && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">נציג</th>}
                  {col('created_at')  && <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">תאריך</th>}
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
                    className={`border-b border-gray-100 transition-colors duration-100 group ${selected.has(lead.id) ? 'bg-[#2398c2]/5' : 'hover:bg-gray-50/80'}`}>
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)}
                        className="rounded border-gray-300 accent-[#2398c2]" />
                    </td>
                    {/* Name */}
                    <td className="px-4 py-2.5 cursor-pointer" onClick={() => setPanelId(lead.id)}>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: lead.stage?.color ?? '#2398c2' }}>{lead.name?.[0] ?? '?'}</div>
                        <span className="font-medium text-gray-900 whitespace-nowrap">{lead.name}</span>
                      </div>
                    </td>
                    {/* Phone */}
                    {col('phone') && (
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap" dir="ltr">
                        {lead.phone
                          ? <a href={`tel:${lead.phone}`} className="hover:text-[#2398c2]" onClick={e => e.stopPropagation()}>{lead.phone}</a>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {/* Email */}
                    {col('email') && (
                      <td className="px-4 py-2.5 max-w-[160px]">
                        {lead.email
                          ? <span className="text-gray-600 truncate block text-xs">{lead.email}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {/* Stage — inline select */}
                    {col('stage') && (
                      <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                        {lead.stage ? (
                          <select value={lead.pipeline_stage_id ?? ''} disabled={!canEdit}
                            onChange={e => changeStage.mutate({ leadId: lead.id, stageId: Number(e.target.value) })}
                            className="inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 border cursor-pointer disabled:cursor-default appearance-none whitespace-nowrap"
                            style={{ backgroundColor: `${lead.stage.color}18`, color: lead.stage.color, borderColor: `${lead.stage.color}40` }}>
                            <option value="" className="text-gray-700 bg-white">ללא שלב</option>
                            {stages.map(s => <option key={s.id} value={s.id} className="text-gray-700 bg-white">{s.name}</option>)}
                          </select>
                        ) : (
                          <select value="" disabled={!canEdit}
                            onChange={e => changeStage.mutate({ leadId: lead.id, stageId: Number(e.target.value) })}
                            className="inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 border border-gray-200 bg-gray-100 text-gray-500 cursor-pointer appearance-none">
                            <option value="" className="text-gray-700 bg-white">ללא שלב</option>
                            {stages.map(s => <option key={s.id} value={s.id} className="text-gray-700 bg-white">{s.name}</option>)}
                          </select>
                        )}
                      </td>
                    )}
                    {/* Status — inline edit */}
                    {col('status') && (
                      <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                        {editingStatus?.leadId === lead.id ? (
                          <select autoFocus value={lead.status ?? 'new'}
                            onChange={e => { updateLead.mutate({ id: lead.id, data: { status: e.target.value } }); setEditSt(null) }}
                            onBlur={() => setEditSt(null)}
                            className="border border-[#2398c2]/50 rounded-lg px-2 py-0.5 text-xs bg-white focus:outline-none">
                            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        ) : (
                          <span className={`flex items-center gap-1 text-xs whitespace-nowrap ${STATUS_COLORS[lead.status] ?? 'text-gray-400'}`}>
                            {STATUS_LABELS[lead.status] ?? lead.status ?? '—'}
                            {canEdit && (
                              <button onClick={() => setEditSt({ leadId: lead.id })}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-[#2398c2] text-xs transition-opacity">✏</button>
                            )}
                          </span>
                        )}
                      </td>
                    )}
                    {/* Source */}
                    {col('source') && (
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {lead.source || <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {/* Agent */}
                    {col('assigned_to') && (
                      <td className="px-4 py-2.5 text-xs text-[#2398c2] whitespace-nowrap">
                        {lead.assigned_user?.name ?? <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {/* Date */}
                    {col('created_at') && (
                      <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap cursor-pointer" onClick={() => setPanelId(lead.id)}>
                        {new Date(lead.created_at).toLocaleDateString('he-IL')}
                      </td>
                    )}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{t('lead')} חדש</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">שם <span className="text-red-400">*</span></label>
                <input required value={form.name} onChange={set('name')} placeholder={`שם ה${t('lead')}`}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">טלפון</label>
                  <input value={form.phone} onChange={set('phone')} type="tel" placeholder="05X-XXXXXXX"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">אימייל</label>
                  <input value={form.email} onChange={set('email')} type="email" placeholder="email@..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('source')}</label>
                  <select value={form.source} onChange={set('source')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]">
                    {SOURCES.map(s => <option key={s} value={s}>{s || `בחר ${t('source')}`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('stage')}</label>
                  <select value={form.pipeline_stage_id} onChange={set('pipeline_stage_id')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]">
                    <option value="">בחר {t('stage')}</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">הערות</label>
                <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="הערות נוספות..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {saving ? 'שומר...' : `הוסף ${t('lead')}`}
                </button>
                <button type="button" onClick={() => setModal(false)}
                  className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
