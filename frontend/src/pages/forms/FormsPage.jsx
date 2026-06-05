import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import client from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { Plus, ExternalLink, Trash2, X } from 'lucide-react'

const MOCK_FORMS = [
  { id: 1, name: 'טופס יצירת קשר', slug: 'contact', active: true,  fields: 4, views: 312, submissions: 87,  conversion: 28 },
  { id: 2, name: 'בקשת הדגמה',      slug: 'demo',    active: true,  fields: 6, views: 198, submissions: 54,  conversion: 27 },
  { id: 3, name: 'טופס הצטרפות',    slug: 'join',    active: false, fields: 8, views: 91,  submissions: 12,  conversion: 13 },
  { id: 4, name: 'סקר לקוחות',      slug: 'survey',  active: true,  fields: 5, views: 445, submissions: 201, conversion: 45 },
]

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'form-' + Date.now()
}

export default function FormsPage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', fields: 3 })
  const [localForms, setLocalForms] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['forms'],
    queryFn: () => client.get('/forms').then(r => r.data.data).catch(() => MOCK_FORMS),
    placeholderData: MOCK_FORMS,
  })

  const toggle = useMutation({
    mutationFn: ({ id, active }) => client.put(`/forms/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  })

  const remove = useMutation({
    mutationFn: (id) => client.delete(`/forms/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  })

  const serverForms = (() => {
    if (Array.isArray(data) && data.length) return data
    if (data?.data?.length) return data.data
    return MOCK_FORMS
  })()

  const forms = localForms ?? serverForms

  const handleToggle = (id, currentActive) => {
    setLocalForms(prev => (prev ?? forms).map(f =>
      f.id === id ? { ...f, active: !currentActive } : f
    ))
    toggle.mutate({ id, active: !currentActive })
  }

  const handleRemove = (id) => {
    setLocalForms(prev => (prev ?? forms).filter(f => f.id !== id))
    remove.mutate(id)
  }

  const handleCreate = (e) => {
    e.preventDefault()
    const created = {
      id: Date.now(),
      name: newForm.name,
      slug: slugify(newForm.name),
      active: false,
      fields: Number(newForm.fields) || 3,
      views: 0,
      submissions: 0,
      conversion: 0,
    }
    setLocalForms(prev => [...(prev ?? forms), created])
    setNewForm({ name: '', fields: 3 })
    setShowForm(false)
  }

  const tabs = [
    { k: 'all',      label: 'הכל',       n: forms.length },
    { k: 'active',   label: 'מפורסמים', n: forms.filter(f => f.active).length },
    { k: 'inactive', label: 'טיוטות',    n: forms.filter(f => !f.active).length },
  ]

  const visible = tab === 'all' ? forms : forms.filter(f => tab === 'active' ? f.active : !f.active)

  return (
    <div>
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
        {can('forms', 'can_create') && (
          <button className="btn btn--accent btn--sm" onClick={() => setShowForm(true)}>
            <Plus size={14} />טופס חדש
          </button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>טופס חדש</div>
            <button className="btn btn--ghost btn--icon" style={{ width: 28, height: 28 }} onClick={() => setShowForm(false)}>
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="input__label">שם הטופס *</label>
              <input className="input" required value={newForm.name}
                onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))}
                placeholder="לדוגמה: טופס יצירת קשר" />
            </div>
            <div style={{ maxWidth: 140 }}>
              <label className="input__label">מספר שדות</label>
              <input className="input" type="number" min="1" max="20" value={newForm.fields}
                onChange={e => setNewForm(p => ({ ...p, fields: e.target.value }))} dir="ltr" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn--primary">צור טופס</button>
              <button type="button" className="btn btn--outline" onClick={() => setShowForm(false)}>ביטול</button>
            </div>
          </form>
        </div>
      )}

      {isLoading && !localForms ? (
        <div style={{ color: 'var(--text-subtle)', fontSize: 13 }}>טוען...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {visible.map(form => (
            <div key={form.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Mini preview */}
              <div style={{
                background: form.active ? 'var(--brand-50)' : 'var(--surface-2)',
                borderBottom: '1px solid var(--border)', padding: '20px 20px 16px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-subtle)', marginBottom: 8 }}>{form.name}</div>
                {[...Array(form.fields ?? 3)].map((_, i) => (
                  <div key={i} style={{
                    height: 8, borderRadius: 4, marginBottom: 6,
                    background: form.active ? 'var(--brand-200)' : 'var(--border)',
                    width: i === (form.fields - 1) ? '40%' : '100%',
                  }} />
                ))}
                <div style={{ height: 28, borderRadius: 6, background: form.active ? 'var(--brand-500)' : 'var(--border-strong)', marginTop: 10 }} />
              </div>

              {/* Info */}
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{form.name}</div>
                  <span className={`pill pill--${form.active ? 'won' : 'talk'}`}>
                    <span className="dot" />{form.active ? 'פעיל' : 'טיוטה'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 10 }} dir="ltr">
                  {window.location.origin}/f/{form.slug}
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-subtle)', marginBottom: 12 }}>
                  <span><b style={{ color: 'var(--text)', fontWeight: 700 }}>{form.views ?? 0}</b> צפיות</span>
                  <span><b style={{ color: 'var(--text)', fontWeight: 700 }}>{form.submissions ?? 0}</b> שליחות</span>
                  <span><b style={{ color: 'var(--brand-600)', fontWeight: 700 }}>{form.conversion ?? 0}%</b> המרה</span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn--outline btn--sm" style={{ flex: 1 }}
                    onClick={() => handleToggle(form.id, form.active)}>
                    {form.active ? 'השהה' : 'פרסם'}
                  </button>
                  <button className="btn btn--ghost btn--icon btn--sm"
                    onClick={() => window.open(`/f/${form.slug}`, '_blank')}>
                    <ExternalLink size={14} />
                  </button>
                  {can('forms', 'can_delete') && (
                    <button className="btn btn--ghost btn--icon btn--sm"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => handleRemove(form.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Create new tile */}
          {can('forms', 'can_create') && (
            <div className="card" style={{
              padding: 0, overflow: 'hidden', cursor: 'pointer',
              border: '2px dashed var(--border)', background: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 220,
            }}>
              <div style={{ textAlign: 'center', color: 'var(--text-subtle)' }}>
                <Plus size={24} style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 13, fontWeight: 600 }}>צור טופס חדש</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
