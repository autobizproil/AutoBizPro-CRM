import { useState } from 'react'
import { useAutomations, useToggleAutomation, useDeleteAutomation } from '../../hooks/useAutomations'
import { useAuth } from '../../context/AuthContext'
import { Plus, X, Flame, Mail, Clock, CheckSquare, ArrowLeftRight, Bell, MessageSquare, Filter, ChevronLeft, Pencil } from 'lucide-react'

// Step kinds — icon component + colors
const KINDS = {
  trigger: { icon: Flame,          bg: 'var(--brand-50)',          fg: 'var(--brand-600)',        label: 'טריגר' },
  condition:{ icon: Filter,        bg: 'var(--amber-50,#fffbeb)',   fg: 'var(--amber-600,#d97706)', label: 'תנאי' },
  email:   { icon: Mail,           bg: 'var(--lime-100)',           fg: 'var(--lime-700)',          label: 'מייל' },
  wait:    { icon: Clock,          bg: 'var(--amber-50,#fffbeb)',   fg: 'var(--amber-600,#d97706)', label: 'המתנה' },
  task:    { icon: CheckSquare,    bg: 'var(--green-50,#f0fdf4)',   fg: 'var(--green-600,#16a34a)', label: 'משימה' },
  stage:   { icon: ArrowLeftRight, bg: 'rgba(102,117,143,.12)',     fg: '#66758f',                  label: 'שינוי שלב' },
  notify:  { icon: Bell,           bg: 'var(--brand-50)',           fg: 'var(--brand-600)',         label: 'התראה' },
  whatsapp:{ icon: MessageSquare,  bg: 'var(--lime-100)',           fg: 'var(--lime-700)',          label: 'WhatsApp' },
}

const TRIGGER_OPTIONS = [
  { value: 'lead_created',       label: 'ליד חדש נוצר' },
  { value: 'lead_stage_changed', label: 'שלב ליד השתנה' },
  { value: 'form_submitted',     label: 'טופס נשלח' },
  { value: 'contact_created',    label: 'איש קשר חדש' },
  { value: 'deal_closed',        label: 'עסקה נסגרה' },
  { value: 'scheduled',          label: 'מתוזמן' },
]

const CONDITION_FIELDS = [
  { value: 'status',  label: 'סטטוס ליד' },
  { value: 'source',  label: 'מקור ליד' },
  { value: 'amount',  label: 'סכום עסקה' },
  { value: 'stage',   label: 'שלב פייפליין' },
]

const ACTION_TYPES = [
  { value: 'email',    label: 'שלח מייל' },
  { value: 'whatsapp', label: 'שלח WhatsApp' },
  { value: 'wait',     label: 'המתן' },
  { value: 'task',     label: 'צור משימה' },
  { value: 'stage',    label: 'שנה שלב' },
  { value: 'notify',   label: 'שלח התראה פנימית' },
]

const MOCK_AUTOMATIONS = [
  {
    id: 1, name: 'קבלת פנים ללידים חדשים', desc: 'שליחת מייל ברוכים הבאים כשנכנס ליד חדש',
    active: true, runs: 1284, success_rate: 99, last: 'לפני 8 דקות',
    steps: [
      { kind: 'trigger',   label: 'ליד חדש נוצר' },
      { kind: 'email',     label: 'מייל ברוכים הבאים' },
      { kind: 'wait',      label: 'המתנה יום' },
      { kind: 'task',      label: 'משימת מעקב לנציג' },
    ],
  },
  {
    id: 2, name: 'תזכורת הצעת מחיר', desc: 'מעקב אחרי הצעות שלא נענו תוך 3 ימים',
    active: true, runs: 642, success_rate: 97, last: 'לפני שעה',
    steps: [
      { kind: 'trigger',   label: 'הצעת מחיר נשלחה' },
      { kind: 'condition', label: 'אם לא נענה' },
      { kind: 'wait',      label: 'המתנה 3 ימים' },
      { kind: 'notify',    label: 'התראה לנציג' },
      { kind: 'email',     label: 'מייל תזכורת' },
    ],
  },
  {
    id: 3, name: 'שיוך לידים אוטומטי', desc: 'חלוקת לידים בין נציגים לפי תורנות',
    active: true, runs: 1820, success_rate: 100, last: 'לפני 3 דקות',
    steps: [
      { kind: 'trigger',   label: 'ליד מדף נחיתה' },
      { kind: 'stage',     label: 'שיוך לנציג פנוי' },
      { kind: 'notify',    label: 'התראה במובייל' },
    ],
  },
  {
    id: 4, name: 'ברכת יום הולדת', desc: 'מסרון אישי ללקוחות ביום ההולדת',
    active: false, runs: 96, success_rate: 94, last: 'לפני 4 ימים',
    steps: [
      { kind: 'trigger',   label: 'יום הולדת לקוח' },
      { kind: 'whatsapp',  label: 'מסרון ברכה אישי' },
    ],
  },
]

function StepNode({ kind, label }) {
  const k = KINDS[kind] || KINDS.trigger
  const Icon = k.icon
  return (
    <div className="au-step">
      <span className="au-step__ic" style={{ background: k.bg, color: k.fg }}>
        <Icon size={14} />
      </span>
      <span className="au-step__lbl">{label}</span>
    </div>
  )
}

function FlowCard({ auto, onToggle, onDelete }) {
  return (
    <div className={`au-card${auto.active ? '' : ' au-card--off'}`}>
      <div className="au-card__head">
        <button
          className={`toggle${auto.active ? ' toggle--on' : ''}`}
          onClick={() => onToggle(auto.id)}
          aria-label="הפעלה"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="au-card__name">{auto.name}</div>
          {auto.desc && <div className="au-card__desc">{auto.desc}</div>}
        </div>
        <span className={`pill pill--${auto.active ? 'won' : 'talk'}`}>
          <span className="dot" />{auto.active ? 'פעיל' : 'מושהה'}
        </span>
        <button
          className="btn btn--ghost btn--icon btn--sm"
          style={{ color: 'var(--danger)' }}
          onClick={() => onDelete(auto.id)}
          title="מחק"
        >
          <X size={14} />
        </button>
      </div>

      <div className="au-flow">
        {auto.steps.map((step, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <StepNode kind={step.kind} label={step.label} />
            {i < auto.steps.length - 1 && (
              <span className="au-arrow"><ChevronLeft size={14} /></span>
            )}
          </span>
        ))}
      </div>

      <div className="au-card__foot">
        <span className="au-stat"><b>{auto.runs ?? 0}</b> הפעלות</span>
        {auto.success_rate != null && (
          <span className="au-stat"><b style={{ color: 'var(--green-600,#16a34a)' }}>{auto.success_rate}%</b> הצלחה</span>
        )}
        {auto.last && <span className="au-stat">הופעל {auto.last}</span>}
        <div style={{ flex: 1 }} />
        <button className="btn btn--ghost btn--sm"><Pencil size={13} />עריכה</button>
      </div>
    </div>
  )
}

const EMPTY_FORM = {
  name: '',
  desc: '',
  trigger: 'lead_created',
  triggerLabel: 'ליד חדש נוצר',
  hasCondition: false,
  conditionField: 'status',
  conditionValue: '',
  actions: [{ type: 'email', label: 'שלח מייל' }],
}

export default function AutomationsPage() {
  const { can } = useAuth()
  const { data, isLoading } = useAutomations()
  const toggleMutation = useToggleAutomation()
  const removeMutation = useDeleteAutomation()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [tab, setTab] = useState('all')
  const [localList, setLocalList] = useState(null)

  const serverList = (() => {
    if (Array.isArray(data) && data.length) return data
    if (data?.data?.length) return data.data
    return null
  })()

  const baseList = localList ?? serverList ?? MOCK_AUTOMATIONS

  const tabs = [
    { k: 'all',     label: 'הכל',     n: baseList.length },
    { k: 'active',  label: 'פעילות',  n: baseList.filter(a => a.active).length },
    { k: 'paused',  label: 'מושהות',  n: baseList.filter(a => !a.active).length },
  ]

  const visible = tab === 'all' ? baseList : baseList.filter(a => tab === 'active' ? a.active : !a.active)

  const handleToggle = (id) => {
    setLocalList(prev => (prev ?? baseList).map(a =>
      a.id === id ? { ...a, active: !a.active } : a
    ))
    if (serverList) toggleMutation.mutate(id)
  }

  const handleDelete = (id) => {
    setLocalList(prev => (prev ?? baseList).filter(a => a.id !== id))
    if (serverList) removeMutation.mutate(id)
  }

  const addAction = () => setForm(f => ({
    ...f,
    actions: [...f.actions, { type: 'email', label: 'שלח מייל' }],
  }))

  const updateAction = (i, field, value) => setForm(f => ({
    ...f,
    actions: f.actions.map((a, idx) => idx === i ? { ...a, [field]: value } : a),
  }))

  const removeAction = (i) => setForm(f => ({
    ...f,
    actions: f.actions.filter((_, idx) => idx !== i),
  }))

  const handleCreate = (e) => {
    e.preventDefault()
    const triggerOpt = TRIGGER_OPTIONS.find(t => t.value === form.trigger)
    const steps = [
      { kind: 'trigger', label: triggerOpt?.label || form.trigger },
      ...(form.hasCondition ? [{ kind: 'condition', label: `אם ${CONDITION_FIELDS.find(f => f.value === form.conditionField)?.label} = ${form.conditionValue || '...'}` }] : []),
      ...form.actions.map(a => ({ kind: a.type, label: a.label || ACTION_TYPES.find(at => at.value === a.type)?.label || a.type })),
    ]
    const newAuto = {
      id: Date.now(),
      name: form.name,
      desc: form.desc,
      active: false,
      runs: 0,
      success_rate: null,
      last: null,
      steps,
    }
    setLocalList(prev => [...(prev ?? baseList), newAuto])
    setForm(EMPTY_FORM)
    setShowForm(false)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {tabs.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              border: 'none', background: tab === t.k ? 'var(--brand-50)' : 'none',
              color: tab === t.k ? 'var(--brand-600)' : 'var(--text-subtle)',
              fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
              padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}>
              {t.label}
              <span style={{
                fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '1px 7px',
                background: tab === t.k ? 'var(--brand-600)' : 'var(--surface-2)',
                color: tab === t.k ? '#fff' : 'var(--text-subtle)',
              }}>{t.n}</span>
            </button>
          ))}
        </div>
        {can('automations', 'can_create') && (
          <button className="btn btn--accent btn--sm" onClick={() => setShowForm(true)}>
            <Plus size={14} />אוטומציה חדשה
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>אוטומציה חדשה</div>
            <button className="btn btn--ghost btn--icon" style={{ width: 28, height: 28 }} onClick={() => setShowForm(false)}>
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Name + desc */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="input__label">שם האוטומציה *</label>
                <input className="input" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="לדוגמה: ברוך הבא ללקוח חדש" />
              </div>
              <div>
                <label className="input__label">תיאור</label>
                <input className="input" value={form.desc}
                  onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                  placeholder="תיאור קצר של האוטומציה" />
              </div>
            </div>

            {/* Trigger */}
            <div style={{ background: 'var(--brand-50)', border: '1px solid var(--brand-200)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ background: 'var(--brand-100)', color: 'var(--brand-600)', borderRadius: 6, width: 26, height: 26, display: 'grid', placeItems: 'center' }}>
                  <Flame size={14} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>טריגר — מה מפעיל את האוטומציה</span>
              </div>
              <select className="input" value={form.trigger}
                onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))}>
                {TRIGGER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Condition */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.hasCondition ? 12 : 0 }}>
                <span style={{ background: 'var(--amber-50,#fffbeb)', color: 'var(--amber-600,#d97706)', borderRadius: 6, width: 26, height: 26, display: 'grid', placeItems: 'center' }}>
                  <Filter size={14} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>תנאי — (אופציונלי)</span>
                <button type="button"
                  className={`toggle${form.hasCondition ? ' toggle--on' : ''}`}
                  onClick={() => setForm(f => ({ ...f, hasCondition: !f.hasCondition }))}
                />
              </div>
              {form.hasCondition && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-subtle)', flexShrink: 0 }}>אם</span>
                  <select className="input" value={form.conditionField}
                    onChange={e => setForm(f => ({ ...f, conditionField: e.target.value }))}
                    style={{ flex: 1 }}>
                    {CONDITION_FIELDS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span style={{ fontSize: 13, color: 'var(--text-subtle)', flexShrink: 0 }}>שווה ל</span>
                  <input className="input" value={form.conditionValue}
                    onChange={e => setForm(f => ({ ...f, conditionValue: e.target.value }))}
                    placeholder="ערך..." style={{ flex: 1 }} />
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>פעולות — מה קורה</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form.actions.map((action, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      background: KINDS[action.type]?.bg || 'var(--surface-2)',
                      color: KINDS[action.type]?.fg || 'var(--text)',
                      borderRadius: 6, width: 26, height: 26, display: 'grid', placeItems: 'center', flexShrink: 0,
                    }}>
                      {(() => { const Icon = KINDS[action.type]?.icon || Mail; return <Icon size={14} /> })()}
                    </span>
                    <select className="input" value={action.type}
                      onChange={e => {
                        const opt = ACTION_TYPES.find(a => a.value === e.target.value)
                        updateAction(i, 'type', e.target.value)
                        updateAction(i, 'label', opt?.label || '')
                      }}
                      style={{ flex: '0 0 160px' }}>
                      {ACTION_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input className="input" value={action.label}
                      onChange={e => updateAction(i, 'label', e.target.value)}
                      placeholder="תיאור הפעולה..."
                      style={{ flex: 1 }} />
                    {form.actions.length > 1 && (
                      <button type="button" className="btn btn--ghost btn--icon btn--sm"
                        style={{ color: 'var(--danger)', flexShrink: 0 }}
                        onClick={() => removeAction(i)}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn--outline btn--sm" style={{ marginTop: 10 }} onClick={addAction}>
                <Plus size={13} />הוסף פעולה
              </button>
            </div>

            {/* Submit */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn--primary">צור אוטומציה</button>
              <button type="button" className="btn btn--outline" onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}>ביטול</button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {isLoading && !localList ? (
        <div style={{ color: 'var(--text-subtle)', fontSize: 13 }}>טוען...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map(auto => (
            <FlowCard key={auto.id} auto={auto} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
          {visible.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-subtle)', fontSize: 14 }}>
              אין אוטומציות עדיין
            </div>
          )}
        </div>
      )}
    </div>
  )
}
