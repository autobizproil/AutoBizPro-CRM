import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import client from '../../api/client'
import { pipelineApi } from '../../api/pipeline'
import { useAutomations, useCreateAutomation, useToggleAutomation, useDeleteAutomation } from '../../hooks/useAutomations'
import { useAuth } from '../../context/AuthContext'

// ── Constants ──────────────────────────────────────────────────────────────────

const TRIGGER_LABELS = {
  lead_created:        'ליד חדש נוצר',
  lead_stage_changed:  'שלב ליד השתנה',
  form_submitted:      'טופס נשלח',
  contact_created:     'איש קשר חדש',
  client_created:      'לקוח חדש נוצר',
  call_received:       'שיחה נכנסת התקבלה',
  whatsapp_received:   'הודעת WhatsApp התקבלה',
}

const ACTION_TYPES = [
  { value: 'create_activity', label: 'תעד פעילות' },
  { value: 'change_stage',    label: 'שנה שלב' },
  { value: 'assign_to',       label: 'הקצה לנציג' },
  { value: 'add_tag',         label: 'הוסף תגית' },
  { value: 'send_whatsapp',   label: 'שלח WhatsApp' },
  { value: 'send_email',      label: 'שלח אימייל' },
  { value: 'convert_to_client', label: 'המר ללקוח' },
  { value: 'webhook',         label: 'שלח Webhook' },
]

const CONDITION_FIELDS = [
  { value: 'name',              label: 'שם' },
  { value: 'phone',             label: 'טלפון' },
  { value: 'email',             label: 'אימייל' },
  { value: 'source',            label: 'מקור' },
  { value: 'pipeline_stage_id', label: 'שלב בפייפליין' },
  { value: 'notes',             label: 'הערות' },
]

const CONDITION_OPERATORS = [
  { value: '=',         label: 'שווה ל' },
  { value: '!=',        label: 'לא שווה ל' },
  { value: 'contains',  label: 'מכיל' },
  { value: 'not_empty', label: 'לא ריק' },
  { value: 'empty',     label: 'ריק' },
]

// ── Default actions ────────────────────────────────────────────────────────────

const ACTION_DEFAULTS = {
  create_activity:   { activity_type: 'note', title: '' },
  change_stage:      { stage_id: '' },
  assign_to:         { user_id: '' },
  add_tag:           { tag: '' },
  send_whatsapp:     { message: '' },
  send_email:        { subject: '', body: '' },
  convert_to_client: {},
  webhook:           { url: '' },
}

// ── Input style ────────────────────────────────────────────────────────────────

const INP = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2398c2]/40'
const INP_SM = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#2398c2]/40'

// ── Component ──────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const { can } = useAuth()
  const { data = [], isLoading } = useAutomations()
  const toggle  = useToggleAutomation()
  const remove  = useDeleteAutomation()
  const create  = useCreateAutomation()

  const [showModal, setShowModal] = useState(false)
  const [name, setName]           = useState('')
  const [trigger, setTrigger]     = useState('lead_created')
  const [actions, setActions]     = useState([{ type: 'create_activity', activity_type: 'note', title: '' }])
  const [conditions, setConds]    = useState([])
  const [error, setError]         = useState('')

  const { data: stages = [] } = useQuery({ queryKey: ['pipeline-stages'], queryFn: () => pipelineApi.stages().then(r => r.data.data) })
  const { data: users = [] }  = useQuery({ queryKey: ['users'],           queryFn: () => client.get('/users').then(r => r.data.data) })

  const automations = Array.isArray(data) ? data : (data?.data ?? [])

  function closeModal() {
    setShowModal(false); setName(''); setTrigger('lead_created')
    setActions([{ type: 'create_activity', activity_type: 'note', title: '' }])
    setConds([]); setError('')
  }

  // Actions
  const setAction  = (i, patch) => setActions(as => as.map((a, idx) => idx === i ? { ...a, ...patch } : a))
  const changeType = (i, type) => setActions(as => as.map((a, idx) => idx === i ? { type, ...ACTION_DEFAULTS[type] } : a))
  const addAction  = () => setActions(as => [...as, { type: 'create_activity', activity_type: 'note', title: '' }])
  const removeAction = (i) => setActions(as => as.filter((_, idx) => idx !== i))

  // Conditions
  const addCond    = () => setConds(cs => [...cs, { field: 'name', operator: '=', value: '' }])
  const setCond    = (i, patch) => setConds(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  const removeCond = (i) => setConds(cs => cs.filter((_, idx) => idx !== i))

  function submit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('שם האוטומציה חובה')
    if (!actions.length) return setError('חובה פעולה אחת לפחות')
    create.mutate(
      { name, trigger_type: trigger, actions, conditions, active: true },
      { onSuccess: closeModal, onError: (er) => setError(er.response?.data?.message ?? 'שגיאה ביצירה') }
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">אוטומציות</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">כשקורה טריגר — בצע פעולות אוטומטית</p>
        </div>
        {can('automations', 'can_create') && (
          <button onClick={() => setShowModal(true)}
            className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm">
            <span className="text-lg leading-none">+</span> אוטומציה חדשה
          </button>
        )}
      </div>

      {isLoading ? <div className="text-gray-500 dark:text-gray-400 text-sm">טוען...</div> : (
        <div className="space-y-3">
          {automations.map(auto => (
            <div key={auto.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{auto.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>⚡ {TRIGGER_LABELS[auto.trigger_type] ?? auto.trigger_type}</span>
                    <span>· {auto.actions?.length ?? 0} פעולות</span>
                    {auto.conditions?.length > 0 && <span>· {auto.conditions.length} תנאים</span>}
                  </div>
                  {/* Actions summary */}
                  {auto.actions?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {auto.actions.map((a, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-[#2398c2]/10 text-[#2398c2] dark:text-[#5bc0e8]">
                          {ACTION_TYPES.find(t => t.value === a.type)?.label ?? a.type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {can('automations', 'can_update') && (
                    <button dir="ltr" onClick={() => toggle.mutate(auto.id)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#2398c2]/40 ${auto.active ? 'bg-[#2398c2]' : 'bg-gray-200 dark:bg-gray-600'}`}>
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${auto.active ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  )}
                  {can('automations', 'can_delete') && (
                    <button onClick={() => { if (confirm('למחוק את האוטומציה?')) remove.mutate(auto.id) }}
                      className="text-red-400 hover:text-red-600 text-xs">מחק</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {automations.length === 0 && (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <div className="text-4xl mb-3">⚡</div>
              <div className="text-sm">אין אוטומציות עדיין</div>
              {can('automations', 'can_create') && (
                <button onClick={() => setShowModal(true)} className="mt-3 text-[#2398c2] hover:underline text-sm">צור אוטומציה ראשונה</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Create Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={closeModal}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">אוטומציה חדשה</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>

            <form onSubmit={submit} className="px-6 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
              {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם <span className="text-red-500">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="לדוגמה: ברכה לליד חדש"
                  className={INP} />
              </div>

              {/* Trigger */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">⚡ טריגר — כאשר...</label>
                <select value={trigger} onChange={e => setTrigger(e.target.value)} className={INP}>
                  {Object.entries(TRIGGER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">🔍 תנאים (אופציונלי)</label>
                  <button type="button" onClick={addCond} className="text-xs text-[#2398c2] hover:underline">+ הוסף תנאי</button>
                </div>
                {conditions.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">ללא תנאים — יפעל תמיד</p>
                )}
                <div className="space-y-2">
                  {conditions.map((cond, i) => (
                    <div key={i} className="flex gap-1.5 items-center flex-wrap">
                      <select value={cond.field} onChange={e => setCond(i, { field: e.target.value })} className={INP_SM}>
                        {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <select value={cond.operator} onChange={e => setCond(i, { operator: e.target.value })} className={INP_SM}>
                        {CONDITION_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                      </select>
                      {!['not_empty', 'empty'].includes(cond.operator) && (
                        cond.field === 'pipeline_stage_id' ? (
                          <select value={cond.value} onChange={e => setCond(i, { value: Number(e.target.value) })}
                            className={INP_SM + ' flex-1 min-w-[80px]'}>
                            <option value="">בחר שלב</option>
                            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        ) : (
                          <input value={cond.value} onChange={e => setCond(i, { value: e.target.value })} placeholder="ערך..."
                            className={INP_SM + ' flex-1 min-w-[80px]'} />
                        )
                      )}
                      <button type="button" onClick={() => removeCond(i)} className="text-red-400 hover:text-red-600 text-lg leading-none px-1">×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">🎯 פעולות — בצע...</label>
                <div className="space-y-2">
                  {actions.map((a, i) => (
                    <div key={i} className="border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 space-y-2 bg-gray-50/50 dark:bg-gray-700/50">
                      <div className="flex gap-2 items-center">
                        <select value={a.type} onChange={e => changeType(i, e.target.value)} className={INP_SM + ' flex-1'}>
                          {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        {actions.length > 1 && (
                          <button type="button" onClick={() => removeAction(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                        )}
                      </div>

                      {a.type === 'create_activity' && (
                        <div className="flex gap-2">
                          <select value={a.activity_type ?? 'note'} onChange={e => setAction(i, { activity_type: e.target.value })} className={INP_SM + ' w-32'}>
                            {['call','whatsapp','email','meeting','note','task'].map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <input value={a.title ?? ''} onChange={e => setAction(i, { title: e.target.value })} placeholder="תוכן הפעילות"
                            className={INP_SM + ' flex-1'} />
                        </div>
                      )}
                      {a.type === 'change_stage' && (
                        <select value={a.stage_id ?? ''} onChange={e => setAction(i, { stage_id: Number(e.target.value) })} className={INP_SM + ' w-full'}>
                          <option value="">בחר שלב</option>
                          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                      {a.type === 'assign_to' && (
                        <select value={a.user_id ?? ''} onChange={e => setAction(i, { user_id: Number(e.target.value) })} className={INP_SM + ' w-full'}>
                          <option value="">בחר נציג</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      )}
                      {a.type === 'add_tag' && (
                        <input value={a.tag ?? ''} onChange={e => setAction(i, { tag: e.target.value })} placeholder="שם התגית" className={INP_SM + ' w-full'} />
                      )}
                      {a.type === 'send_whatsapp' && (
                        <textarea value={a.message ?? ''} onChange={e => setAction(i, { message: e.target.value })} rows={2}
                          placeholder="תוכן ההודעה. משתנים: {name} {phone} {email} {source}"
                          className={INP_SM + ' w-full resize-none'} />
                      )}
                      {a.type === 'send_email' && (
                        <>
                          <input value={a.subject ?? ''} onChange={e => setAction(i, { subject: e.target.value })} placeholder="נושא" className={INP_SM + ' w-full'} />
                          <textarea value={a.body ?? ''} onChange={e => setAction(i, { body: e.target.value })} rows={2} placeholder="תוכן" className={INP_SM + ' w-full resize-none'} />
                        </>
                      )}
                      {a.type === 'webhook' && (
                        <input value={a.url ?? ''} onChange={e => setAction(i, { url: e.target.value })} placeholder="https://hook.make.com/..." dir="ltr" className={INP_SM + ' w-full'} />
                      )}
                      {a.type === 'convert_to_client' && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">הליד יומר ללקוח אוטומטית</p>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addAction} className="mt-2 text-[#2398c2] dark:text-[#5bc0e8] hover:underline text-sm font-medium">+ הוסף פעולה</button>
              </div>

              <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
                <button type="submit" disabled={create.isPending}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {create.isPending ? 'שומר...' : 'צור אוטומציה'}
                </button>
                <button type="button" onClick={closeModal} className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
