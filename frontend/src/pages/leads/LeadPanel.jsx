import { useState, useEffect } from 'react'
import { useLead, useLeadActivities, useUpdateLead, useAddLeadActivity } from '../../hooks/useLeads'
import { useWhatsappTemplates } from '../../hooks/useWhatsapp'
import { renderTemplate, waLink } from '../../api/whatsapp'

const ACTIVITY_TYPES = {
  call:         { label: 'שיחה',  icon: '📞', color: '#3b82f6' },
  whatsapp:     { label: 'וואטסאפ', icon: '💬', color: '#22c55e' },
  email:        { label: 'אימייל', icon: '✉️', color: '#a855f7' },
  meeting:      { label: 'פגישה', icon: '🤝', color: '#f59e0b' },
  note:         { label: 'הערה',  icon: '📝', color: '#6b7280' },
  task:         { label: 'משימה', icon: '✅', color: '#0ea5e9' },
  stage_change: { label: 'שינוי שלב', icon: '🔀', color: '#6366f1' },
}

function timeAgo(iso) {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'הרגע'
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק'`
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע'`
  return d.toLocaleDateString('he-IL')
}

export default function LeadPanel({ leadId, stages = [], onClose, canEdit }) {
  const { data: lead, isLoading }   = useLead(leadId)
  const { data: activities = [] }   = useLeadActivities(leadId)
  const updateLead                  = useUpdateLead()
  const addActivity                 = useAddLeadActivity()
  const { data: templates = [] }    = useWhatsappTemplates()

  const [edit, setEdit]       = useState({})
  const [activityType, setAT] = useState('call')
  const [activityBody, setAB] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)

  // Reset local edit state when switching leads
  useEffect(() => { setEdit({}); setAB(''); setShowTemplates(false) }, [leadId])

  if (!leadId) return null

  const field = (key) => edit[key] !== undefined ? edit[key] : (lead?.[key] ?? '')
  const setField = (key) => (e) => setEdit(s => ({ ...s, [key]: e.target.value }))
  const commit = (key) => {
    if (edit[key] === undefined || edit[key] === (lead?.[key] ?? '')) return
    updateLead.mutate({ id: leadId, data: { [key]: edit[key] } })
  }

  const changeStage = (e) => updateLead.mutate({ id: leadId, data: { pipeline_stage_id: Number(e.target.value) } })

  const submitActivity = (e) => {
    e.preventDefault()
    if (!activityBody.trim()) return
    addActivity.mutate({ leadId, data: { type: activityType, body: activityBody } })
    setAB('')
  }

  const sendWhatsapp = (template) => {
    const msg = template ? renderTemplate(template.body, { name: lead.name }) : ''
    window.open(waLink(lead?.phone, msg), '_blank')
    // log it
    addActivity.mutate({ leadId, data: { type: 'whatsapp', body: msg || 'נשלחה הודעת וואטסאפ' } })
    setShowTemplates(false)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 left-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col" dir="rtl">
        {isLoading || !lead ? (
          <div className="flex items-center justify-center h-full text-gray-400">טוען...</div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between"
              style={{ borderTop: `4px solid ${lead.stage?.color ?? '#6366f1'}` }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold flex-shrink-0"
                  style={{ backgroundColor: lead.stage?.color ?? '#6366f1' }}>
                  {lead.name?.[0] ?? '?'}
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-gray-900 text-lg truncate">{lead.name}</h2>
                  <p className="text-xs text-gray-400">נוצר {new Date(lead.created_at).toLocaleDateString('he-IL')}</p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            {/* Quick actions */}
            <div className="px-5 py-3 border-b border-gray-100 flex gap-2">
              {lead.phone && (
                <a href={`tel:${lead.phone}`}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-lg text-sm font-medium transition-colors">
                  📞 התקשר
                </a>
              )}
              {lead.phone && (
                <div className="flex-1 relative">
                  <button onClick={() => setShowTemplates(s => !s)}
                    className="w-full flex items-center justify-center gap-1.5 bg-green-50 hover:bg-green-100 text-green-700 py-2 rounded-lg text-sm font-medium transition-colors">
                    💬 וואטסאפ
                  </button>
                  {showTemplates && (
                    <div className="absolute top-full mt-1 right-0 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 max-h-56 overflow-y-auto">
                      <button onClick={() => sendWhatsapp(null)}
                        className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 text-gray-700">הודעה ריקה</button>
                      {templates.map(t => (
                        <button key={t.id} onClick={() => sendWhatsapp(t)}
                          className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 border-t border-gray-50">
                          <div className="font-medium text-gray-800">{t.name}</div>
                          <div className="text-xs text-gray-400 truncate">{t.body}</div>
                        </button>
                      ))}
                      {templates.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">אין תבניות — הוסף בהגדרות</div>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Details */}
              <div className="px-5 py-4 space-y-3 border-b border-gray-100">
                <Detail label="שלב">
                  <select value={lead.pipeline_stage_id ?? ''} onChange={changeStage} disabled={!canEdit}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white disabled:opacity-60">
                    <option value="">ללא שלב</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Detail>
                <EditableDetail label="טלפון" value={field('phone')} onChange={setField('phone')} onBlur={() => commit('phone')} disabled={!canEdit} type="tel" />
                <EditableDetail label="אימייל" value={field('email')} onChange={setField('email')} onBlur={() => commit('email')} disabled={!canEdit} type="email" />
                <EditableDetail label="מקור" value={field('source')} onChange={setField('source')} onBlur={() => commit('source')} disabled={!canEdit} />
                <div>
                  <label className="text-xs text-gray-500 block mb-1">הערות</label>
                  <textarea value={field('notes')} onChange={setField('notes')} onBlur={() => commit('notes')} disabled={!canEdit} rows={2}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm resize-none disabled:opacity-60" placeholder="הוסף הערה..." />
                </div>
              </div>

              {/* Activity composer */}
              {canEdit && (
                <form onSubmit={submitActivity} className="px-5 py-4 border-b border-gray-100">
                  <label className="text-xs font-medium text-gray-600 block mb-2">תיעוד פעילות</label>
                  <div className="flex gap-2 mb-2">
                    <select value={activityType} onChange={e => setAT(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                      {['call','whatsapp','email','meeting','note','task'].map(t =>
                        <option key={t} value={t}>{ACTIVITY_TYPES[t].icon} {ACTIVITY_TYPES[t].label}</option>)}
                    </select>
                    <input value={activityBody} onChange={e => setAB(e.target.value)} placeholder="מה קרה?"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <button type="submit" disabled={!activityBody.trim() || addActivity.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-sm font-medium w-full">
                    {addActivity.isPending ? 'שומר...' : 'הוסף לתיעוד'}
                  </button>
                </form>
              )}

              {/* Timeline */}
              <div className="px-5 py-4">
                <h3 className="text-xs font-medium text-gray-600 mb-3">ציר זמן ({activities.length})</h3>
                {activities.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">אין פעילות עדיין</p>
                ) : (
                  <div className="space-y-3">
                    {activities.map(a => {
                      const meta = ACTIVITY_TYPES[a.type] ?? ACTIVITY_TYPES.note
                      return (
                        <div key={a.id} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                            style={{ backgroundColor: meta.color + '22' }}>{meta.icon}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-700">{meta.label}</span>
                              <span className="text-xs text-gray-400">{timeAgo(a.created_at)}</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-0.5 break-words">{a.body}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Detail({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </div>
  )
}

function EditableDetail({ label, value, onChange, onBlur, disabled, type = 'text' }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
      <input type={type} value={value} onChange={onChange} onBlur={onBlur} disabled={disabled}
        className="text-sm text-gray-800 text-left border border-transparent hover:border-gray-200 focus:border-indigo-300 rounded px-2 py-1 w-44 focus:outline-none disabled:opacity-60"
        placeholder="—" />
    </div>
  )
}
