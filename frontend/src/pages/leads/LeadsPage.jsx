import { useState } from 'react'
import { useLeads, useCreateLead, useChangeLeadStage, useBulkLeadAction, useDeleteAllLeads } from '../../hooks/useLeads'
import { useQuery } from '@tanstack/react-query'
import { pipelineApi } from '../../api/pipeline'
import { useAuth } from '../../context/AuthContext'
import { useLabels } from '../../context/LabelsContext'
import LeadPanel from './LeadPanel'

const SOURCES = ['', 'אתר', 'פייסבוק', 'גוגל', 'המלצה', 'אחר']
const EMPTY_FORM = { name: '', phone: '', email: '', source: '', pipeline_stage_id: '', notes: '' }

export default function LeadsPage() {
  const { can } = useAuth()
  const { t } = useLabels()
  const [search, setSearch]     = useState('')
  const [stageFilter, setStage] = useState('')
  const [showModal, setModal]   = useState(false)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [panelId, setPanelId]   = useState(null)

  const { data, isLoading } = useLeads({ search, stage_id: stageFilter })
  const createLead   = useCreateLead()
  const changeStage  = useChangeLeadStage()
  const bulkAction   = useBulkLeadAction()

  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: () => pipelineApi.stages().then(r => r.data.data),
  })

  const deleteAll = useDeleteAllLeads()
  const leads = data?.data ?? []
  const total = data?.total ?? 0
  const canEdit = can('leads', 'can_update')

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

  // selection
  const toggle = (id) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleAll = () => setSelected(s => s.size === leads.length ? new Set() : new Set(leads.map(l => l.id)))
  const clearSel = () => setSelected(new Set())

  const runBulk = async (action, value) => {
    await bulkAction.mutateAsync({ action, ids: [...selected], value })
    clearSel()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('leads')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} {t('leads')} במערכת</p>
        </div>
        <div className="flex items-center gap-2">
          {can('leads', 'can_delete') && total > 0 && (
            <button onClick={handleDeleteAll} disabled={deleteAll.isPending}
              className="bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
              {deleteAll.isPending ? 'מוחק...' : `🗑 מחק הכל`}
            </button>
          )}
          {can('leads', 'can_create') && (
            <button onClick={() => setModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
              <span className="text-lg leading-none">+</span> {t('lead')} חדש
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input type="text" placeholder={`🔍  חיפוש ${t('lead')}...`}
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <select value={stageFilter} onChange={e => setStage(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
          <option value="">כל ה{t('stage')}ים</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-indigo-700">{selected.size} נבחרו</span>
          <select onChange={e => { if (e.target.value) runBulk('change_stage', Number(e.target.value)); e.target.value = '' }}
            className="border border-indigo-200 rounded-lg px-2 py-1 text-sm bg-white" defaultValue="">
            <option value="" disabled>שנה {t('stage')}...</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {can('leads', 'can_delete') && (
            <button onClick={() => { if (confirm(`למחוק ${selected.size} ${t('leads')}?`)) runBulk('delete') }}
              className="text-sm text-red-600 hover:text-red-700 font-medium">מחק</button>
          )}
          <button onClick={clearSel} className="text-sm text-gray-500 mr-auto">בטל בחירה</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-right">
              <th className="px-4 py-3 w-8">
                <input type="checkbox" checked={leads.length > 0 && selected.size === leads.length} onChange={toggleAll}
                  className="rounded border-gray-300" />
              </th>
              <th className="px-4 py-3 font-medium text-gray-500">{t('lead')}</th>
              <th className="px-4 py-3 font-medium text-gray-500">טלפון</th>
              <th className="px-4 py-3 font-medium text-gray-500">{t('source')}</th>
              <th className="px-4 py-3 font-medium text-gray-500">{t('stage')}</th>
              <th className="px-4 py-3 font-medium text-gray-500">תאריך</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">טוען...</td></tr>}
            {!isLoading && leads.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                <div className="text-3xl mb-2">👥</div><div>אין {t('leads')} עדיין</div>
              </td></tr>
            )}
            {leads.map(lead => (
              <tr key={lead.id} className={`hover:bg-indigo-50/40 transition-colors ${selected.has(lead.id) ? 'bg-indigo-50/60' : ''}`}>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)}
                    className="rounded border-gray-300" />
                </td>
                <td className="px-4 py-3 cursor-pointer" onClick={() => setPanelId(lead.id)}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: lead.stage?.color ?? '#6366f1' }}>{lead.name[0]}</div>
                    <span className="font-medium text-gray-900">{lead.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {lead.phone ? <a href={`tel:${lead.phone}`} className="hover:text-indigo-600" onClick={e => e.stopPropagation()}>{lead.phone}</a> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{lead.source || <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <select value={lead.pipeline_stage_id ?? ''} disabled={!canEdit}
                    onChange={e => changeStage.mutate({ leadId: lead.id, stageId: Number(e.target.value) })}
                    className="text-xs rounded-full px-2 py-1 border-0 font-medium text-white cursor-pointer disabled:cursor-default appearance-none"
                    style={{ backgroundColor: lead.stage?.color ?? '#9ca3af' }}>
                    <option value="" className="text-gray-700 bg-white">ללא שלב</option>
                    {stages.map(s => <option key={s.id} value={s.id} className="text-gray-700 bg-white">{s.name}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs cursor-pointer" onClick={() => setPanelId(lead.id)}>
                  {new Date(lead.created_at).toLocaleDateString('he-IL')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lead detail panel */}
      {panelId && <LeadPanel leadId={panelId} stages={stages} canEdit={canEdit} onClose={() => setPanelId(null)} />}

      {/* Add Lead Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{t('lead')} חדש</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={set('name')} placeholder={`שם ה${t('lead')}`}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                  <input value={form.phone} onChange={set('phone')} type="tel" placeholder="05X-XXXXXXX"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                  <input value={form.email} onChange={set('email')} type="email" placeholder="email@..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('source')}</label>
                  <select value={form.source} onChange={set('source')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {SOURCES.map(s => <option key={s} value={s}>{s || `בחר ${t('source')}`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('stage')}</label>
                  <select value={form.pipeline_stage_id} onChange={set('pipeline_stage_id')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">בחר {t('stage')}</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
                <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="הערות נוספות..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {saving ? 'שומר...' : `הוסף ${t('lead')}`}
                </button>
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
