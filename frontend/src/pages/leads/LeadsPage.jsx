import { useState } from 'react'
import { useLeads, useCreateLead, useDeleteLead } from '../../hooks/useLeads'
import { useQuery } from '@tanstack/react-query'
import { pipelineApi } from '../../api/pipeline'
import { useAuth } from '../../context/AuthContext'

function Avatar({ name, color }) {
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
      style={{ backgroundColor: color ?? '#6366f1' }}>
      {name?.[0] ?? '?'}
    </div>
  )
}

const SOURCES = ['', 'אתר', 'פייסבוק', 'גוגל', 'המלצה', 'אחר']

const EMPTY_FORM = { name: '', phone: '', email: '', source: '', pipeline_stage_id: '', notes: '' }

export default function LeadsPage() {
  const { can } = useAuth()
  const [search, setSearch]       = useState('')
  const [stageFilter, setStage]   = useState('')
  const [showModal, setModal]     = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [error, setError]         = useState('')
  const [saving, setSaving]       = useState(false)

  const { data, isLoading, refetch } = useLeads({ search, stage_id: stageFilter })
  const createLead = useCreateLead()
  const deleteLead = useDeleteLead()

  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: () => pipelineApi.stages().then(r => r.data.data),
  })

  const leads = data?.data ?? []
  const total = data?.total ?? 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await createLead.mutateAsync({
        ...form,
        pipeline_stage_id: form.pipeline_stage_id || undefined,
      })
      setForm(EMPTY_FORM)
      setModal(false)
    } catch (err) {
      setError(err.response?.data?.message ?? err.response?.data?.errors?.name?.[0] ?? 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">לידים</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} לידים במערכת</p>
        </div>
        {can('leads', 'can_create') && (
          <button onClick={() => setModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
            <span className="text-lg leading-none">+</span> ליד חדש
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text" placeholder="🔍  חיפוש לפי שם, טלפון, אימייל..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <select value={stageFilter} onChange={e => setStage(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
          <option value="">כל השלבים</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-right">
              <th className="px-4 py-3 font-medium text-gray-500 w-8">#</th>
              <th className="px-4 py-3 font-medium text-gray-500">שם</th>
              <th className="px-4 py-3 font-medium text-gray-500">טלפון</th>
              <th className="px-4 py-3 font-medium text-gray-500">אימייל</th>
              <th className="px-4 py-3 font-medium text-gray-500">מקור</th>
              <th className="px-4 py-3 font-medium text-gray-500">שלב</th>
              <th className="px-4 py-3 font-medium text-gray-500">תאריך</th>
              <th className="px-4 py-3 font-medium text-gray-500 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">טוען...</td></tr>
            )}
            {!isLoading && leads.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">
                <div className="text-3xl mb-2">👥</div>
                <div>אין לידים עדיין</div>
                {can('leads','can_create') && (
                  <button onClick={() => setModal(true)} className="mt-3 text-indigo-600 hover:underline text-sm">+ הוסף ליד ראשון</button>
                )}
              </td></tr>
            )}
            {leads.map((lead, i) => (
              <tr key={lead.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={lead.name} color={lead.stage?.color} />
                    <div>
                      <div className="font-medium text-gray-900">{lead.name}</div>
                      {lead.notes && <div className="text-xs text-gray-400 truncate max-w-32">{lead.notes}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {lead.phone
                    ? <a href={`tel:${lead.phone}`} className="hover:text-indigo-600">{lead.phone}</a>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {lead.email
                    ? <a href={`mailto:${lead.email}`} className="hover:text-indigo-600 truncate block max-w-36">{lead.email}</a>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{lead.source || <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3">
                  {lead.stage
                    ? <span className="px-2 py-1 rounded-full text-xs text-white font-medium"
                        style={{ backgroundColor: lead.stage.color }}>{lead.stage.name}</span>
                    : <span className="text-gray-300 text-xs">ללא שלב</span>}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(lead.created_at).toLocaleDateString('he-IL')}
                </td>
                <td className="px-4 py-3">
                  {can('leads', 'can_delete') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm('למחוק ליד זה?')) deleteLead.mutate(lead.id) }}
                      className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none"
                      title="מחק">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Lead Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">ליד חדש</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={set('name')} placeholder="שם הליד"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                  <input value={form.phone} onChange={set('phone')} placeholder="05X-XXXXXXX" type="tel"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                  <input value={form.email} onChange={set('email')} placeholder="email@example.com" type="email"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">מקור</label>
                  <select value={form.source} onChange={set('source')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    {SOURCES.map(s => <option key={s} value={s}>{s || 'בחר מקור'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שלב</label>
                  <select value={form.pipeline_stage_id} onChange={set('pipeline_stage_id')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">בחר שלב</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
                <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="הערות נוספות..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </div>

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'שומר...' : 'הוסף ליד'}
                </button>
                <button type="button" onClick={() => setModal(false)}
                  className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition-colors">
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
