import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import client from '../../api/client'
import { pipelineApi } from '../../api/pipeline'
import { useAutomations, useCreateAutomation, useToggleAutomation, useDeleteAutomation } from '../../hooks/useAutomations'
import { useAuth } from '../../context/AuthContext'

const TRIGGER_LABELS = {
  lead_created:       'ליד חדש נוצר',
  lead_stage_changed: 'שלב ליד השתנה',
  form_submitted:     'טופס נשלח',
  contact_created:    'איש קשר חדש',
  scheduled:          'מתוזמן',
}

const ACTION_TYPES = [
  { value: 'create_activity', label: 'תעד פעילות' },
  { value: 'change_stage',    label: 'שנה שלב' },
  { value: 'assign_to',       label: 'הקצה לנציג' },
  { value: 'add_tag',         label: 'הוסף תגית' },
  { value: 'send_whatsapp',   label: 'שלח WhatsApp' },
  { value: 'send_email',      label: 'שלח אימייל' },
]

export default function AutomationsPage() {
  const { can }   = useAuth()
  const { data = [], isLoading } = useAutomations()
  const toggle    = useToggleAutomation()
  const remove    = useDeleteAutomation()
  const create    = useCreateAutomation()

  const [showModal, setShowModal] = useState(false)
  const [name, setName]       = useState('')
  const [trigger, setTrigger] = useState('lead_created')
  const [actions, setActions] = useState([{ type: 'create_activity', activity_type: 'note', title: '' }])
  const [error, setError]     = useState('')

  const { data: stages = [] } = useQuery({ queryKey: ['pipeline-stages'], queryFn: () => pipelineApi.stages().then(r => r.data.data) })
  const { data: users = [] }  = useQuery({ queryKey: ['users'], queryFn: () => client.get('/users').then(r => r.data.data) })

  const automations = Array.isArray(data) ? data : (data?.data ?? [])

  const closeModal = () => {
    setShowModal(false); setName(''); setTrigger('lead_created')
    setActions([{ type: 'create_activity', activity_type: 'note', title: '' }]); setError('')
  }
  const setAction = (i, patch) => setActions(as => as.map((a, idx) => idx === i ? { ...a, ...patch } : a))
  const changeActionType = (i, type) => {
    const defaults = {
      create_activity: { activity_type: 'note', title: '' },
      change_stage:    { stage_id: stages[0]?.id ?? '' },
      assign_to:       { user_id: users[0]?.id ?? '' },
      add_tag:         { tag: '' },
      send_whatsapp:   { message: '' },
      send_email:      { subject: '', body: '' },
    }
    setActions(as => as.map((a, idx) => idx === i ? { type, ...defaults[type] } : a))
  }
  const addAction = () => setActions(as => [...as, { type: 'create_activity', activity_type: 'note', title: '' }])
  const removeAction = (i) => setActions(as => as.filter((_, idx) => idx !== i))

  const submit = (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('שם האוטומציה חובה')
    if (!actions.length) return setError('חובה פעולה אחת לפחות')
    create.mutate(
      { name, trigger_type: trigger, actions, active: true },
      { onSuccess: closeModal, onError: (er) => setError(er.response?.data?.message ?? 'שגיאה ביצירה') }
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">אוטומציות</h2>
          <p className="text-sm text-gray-500 mt-0.5">כשקורה טריגר — בצע פעולות אוטומטית</p>
        </div>
        {can('automations', 'can_create') && (
          <button onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm">
            <span className="text-lg leading-none">+</span> אוטומציה חדשה
          </button>
        )}
      </div>

      {isLoading ? <div className="text-gray-500 text-sm">טוען...</div> : (
        <div className="space-y-3">
          {automations.map(auto => (
            <div key={auto.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{auto.name}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    טריגר: {TRIGGER_LABELS[auto.trigger_type] ?? auto.trigger_type}
                    {' · '}{auto.actions?.length ?? 0} פעולות
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {can('automations', 'can_update') && (
                    <button onClick={() => toggle.mutate(auto.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${auto.active ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${auto.active ? 'translate-x-1' : 'translate-x-6'}`} />
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
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">⚡</div>
              <div className="text-sm">אין אוטומציות עדיין</div>
              {can('automations', 'can_create') && (
                <button onClick={() => setShowModal(true)} className="mt-3 text-indigo-600 hover:underline text-sm">צור אוטומציה ראשונה</button>
              )}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">אוטומציה חדשה</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={submit} className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם <span className="text-red-500">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="לדוגמה: שלח ברכה לליד חדש"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">כאשר (טריגר)</label>
                <select value={trigger} onChange={e => setTrigger(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  {Object.entries(TRIGGER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">בצע (פעולות)</label>
                <div className="space-y-2">
                  {actions.map((a, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-2 space-y-2 bg-gray-50/50">
                      <div className="flex gap-2 items-center">
                        <select value={a.type} onChange={e => changeActionType(i, e.target.value)}
                          className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                          {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        {actions.length > 1 && (
                          <button type="button" onClick={() => removeAction(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                        )}
                      </div>
                      {a.type === 'create_activity' && (
                        <input value={a.title ?? ''} onChange={e => setAction(i, { title: e.target.value })} placeholder="תוכן הפעילות"
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                      )}
                      {a.type === 'change_stage' && (
                        <select value={a.stage_id ?? ''} onChange={e => setAction(i, { stage_id: Number(e.target.value) })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                          <option value="">בחר שלב</option>
                          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                      {a.type === 'assign_to' && (
                        <select value={a.user_id ?? ''} onChange={e => setAction(i, { user_id: Number(e.target.value) })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                          <option value="">בחר נציג</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      )}
                      {a.type === 'add_tag' && (
                        <input value={a.tag ?? ''} onChange={e => setAction(i, { tag: e.target.value })} placeholder="שם התגית"
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                      )}
                      {a.type === 'send_whatsapp' && (
                        <input value={a.message ?? ''} onChange={e => setAction(i, { message: e.target.value })} placeholder="תוכן ההודעה ({name} = שם הליד)"
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                      )}
                      {a.type === 'send_email' && (
                        <>
                          <input value={a.subject ?? ''} onChange={e => setAction(i, { subject: e.target.value })} placeholder="נושא"
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                          <textarea value={a.body ?? ''} onChange={e => setAction(i, { body: e.target.value })} placeholder="תוכן" rows={2}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm resize-none" />
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addAction} className="mt-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium">+ הוסף פעולה</button>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={create.isPending}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {create.isPending ? 'שומר...' : 'צור אוטומציה'}
                </button>
                <button type="button" onClick={closeModal} className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
