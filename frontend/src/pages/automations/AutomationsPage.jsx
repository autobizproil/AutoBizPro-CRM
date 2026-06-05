import { useState } from 'react'
import { useAutomations, useToggleAutomation, useDeleteAutomation } from '../../hooks/useAutomations'
import { useAuth } from '../../context/AuthContext'
import { Plus, X } from 'lucide-react'

const MOCK_AUTOMATIONS = [
  { id: 1, name: 'ברוך הבא — ליד חדש', trigger_type: 'lead_created',       active: true,  actions: [{}, {}],    runs: 142, success_rate: 98 },
  { id: 2, name: 'תזכורת הצעת מחיר',    trigger_type: 'lead_stage_changed',  active: true,  actions: [{}, {}, {}], runs: 87,  success_rate: 94 },
  { id: 3, name: 'טופס נחיתה → ליד',   trigger_type: 'form_submitted',       active: true,  actions: [{}],         runs: 310, success_rate: 100 },
  { id: 4, name: 'עסקה שנסגרה — CRM',  trigger_type: 'lead_stage_changed',  active: false, actions: [{}, {}],    runs: 28,  success_rate: 89 },
]

const TRIGGER_LABELS = {
  lead_created:       'ליד חדש נוצר',
  lead_stage_changed: 'שלב ליד השתנה',
  form_submitted:     'טופס נשלח',
  contact_created:    'איש קשר חדש',
  scheduled:          'מתוזמן',
}

export default function AutomationsPage() {
  const { can } = useAuth()
  const { data, isLoading } = useAutomations()
  const toggle = useToggleAutomation()
  const remove = useDeleteAutomation()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', trigger_type: 'lead_created' })
  const [localList, setLocalList] = useState(null)

  const serverList = (() => {
    if (Array.isArray(data) && data.length) return data
    if (data?.data?.length) return data.data
    return null
  })()

  const automations = localList ?? serverList ?? MOCK_AUTOMATIONS

  const handleToggle = (id) => {
    setLocalList(prev => (prev ?? automations).map(a =>
      a.id === id ? { ...a, active: !a.active } : a
    ))
    if (serverList) toggle.mutate(id)
  }

  const handleDelete = (id) => {
    setLocalList(prev => (prev ?? automations).filter(a => a.id !== id))
    if (serverList) remove.mutate(id)
  }

  const handleCreate = (e) => {
    e.preventDefault()
    const newAuto = {
      id: Date.now(),
      name: form.name,
      trigger_type: form.trigger_type,
      active: false,
      actions: [],
      runs: 0,
      success_rate: null,
    }
    setLocalList(prev => [...(prev ?? automations), newAuto])
    setForm({ name: '', trigger_type: 'lead_created' })
    setShowForm(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>אוטומציות</div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 2 }}>
            {automations.filter(a => a.active).length} פעילות מתוך {automations.length}
          </div>
        </div>
        {can('automations', 'can_create') && (
          <button className="btn btn--accent btn--sm" onClick={() => setShowForm(true)}>
            <Plus size={14} />אוטומציה חדשה
          </button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>אוטומציה חדשה</div>
            <button className="btn btn--ghost btn--icon" style={{ width: 28, height: 28 }} onClick={() => setShowForm(false)}>
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="input__label">שם האוטומציה *</label>
              <input className="input" required value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="לדוגמה: ברוך הבא ללקוח חדש" />
            </div>
            <div>
              <label className="input__label">טריגר</label>
              <select className="input" value={form.trigger_type}
                onChange={e => setForm(p => ({ ...p, trigger_type: e.target.value }))}>
                {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn--primary">צור אוטומציה</button>
              <button type="button" className="btn btn--outline" onClick={() => setShowForm(false)}>ביטול</button>
            </div>
          </form>
        </div>
      )}

      {isLoading && !localList ? (
        <div style={{ color: 'var(--text-subtle)', fontSize: 13 }}>טוען...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {automations.map(auto => (
            <div key={auto.id} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button
                  onClick={() => handleToggle(auto.id)}
                  style={{
                    flexShrink: 0, width: 44, height: 24, borderRadius: 999,
                    background: auto.active ? 'var(--brand-500)' : 'var(--border-strong)',
                    border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
                    background: '#fff', transition: 'inset-inline-start .2s',
                    insetInlineStart: auto.active ? 22 : 2,
                  }} />
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{auto.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-subtle)', marginTop: 2 }}>
                    {TRIGGER_LABELS[auto.trigger_type] ?? auto.trigger_type}
                    {' · '}
                    {auto.actions?.length ?? 0} פעולות
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-subtle)', flexShrink: 0 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{auto.runs ?? 0}</div>
                    <div>הרצות</div>
                  </div>
                  {auto.success_rate != null && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--green-600,#16a34a)' }}>{auto.success_rate}%</div>
                      <div>הצלחה</div>
                    </div>
                  )}
                </div>

                <span className={`pill pill--${auto.active ? 'won' : 'talk'}`}>
                  <span className="dot" />{auto.active ? 'פעיל' : 'מושהה'}
                </span>

                <button
                  onClick={() => handleDelete(auto.id)}
                  style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >
                  מחק
                </button>
              </div>
            </div>
          ))}
          {automations.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-subtle)', fontSize: 14 }}>
              אין אוטומציות עדיין
            </div>
          )}
        </div>
      )}
    </div>
  )
}
