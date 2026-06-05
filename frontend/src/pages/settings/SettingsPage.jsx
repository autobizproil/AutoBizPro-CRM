import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import client from '../../api/client'
import { settingsApi } from '../../api/settings'
import { useAuth } from '../../context/AuthContext'
import { MOCK_STAGES } from '../../api/mockData'
import {
  Settings, Users, Link2, MessageSquare, Palette, Shield,
  Bell, Globe, Database, GripVertical, Pencil,
  Trash2, Plus, ToggleLeft, ToggleRight, Check, X, Save,
} from 'lucide-react'

const INIT_USERS = [
  { id: 1, name: 'דנה כהן',   email: 'dana@autobizpro.co.il',  role: 'מנהלת מכירות', status: 'active', last_login: '03/06/2026 09:12' },
  { id: 2, name: 'אבי רז',    email: 'avi@autobizpro.co.il',   role: 'נציג מכירות',   status: 'active', last_login: '03/06/2026 08:45' },
  { id: 3, name: 'מאיה לוי',  email: 'maya@autobizpro.co.il',  role: 'נציגת מכירות', status: 'active', last_login: '02/06/2026 17:30' },
  { id: 4, name: 'רון גל',    email: 'ron@autobizpro.co.il',   role: 'נציג מכירות',   status: 'inactive', last_login: '28/05/2026 14:00' },
]

const INIT_INTEGRATIONS = [
  { id: 'google',   name: 'Google Workspace',  desc: 'סנכרון יומן ואנשי קשר',    connected: true,  icon: '🔗' },
  { id: 'facebook', name: 'Facebook Leads',    desc: 'ייבוא לידים מפייסבוק',      connected: true,  icon: '📘' },
  { id: 'zapier',   name: 'Zapier',            desc: 'אוטומציות עם 5,000+ אפליקציות', connected: false, icon: '⚡' },
  { id: 'sheets',   name: 'Google Sheets',     desc: 'ייצוא דוחות אוטומטי',       connected: false, icon: '📊' },
  { id: 'slack',    name: 'Slack',             desc: 'התראות בערוץ צוות',          connected: false, icon: '💬' },
  { id: 'hubspot',  name: 'HubSpot',           desc: 'סנכרון CRM דו-כיווני',      connected: false, icon: '🟠' },
]

const INIT_LEAD_STATUSES = [
  { id: 'new',         label: 'חדש',          color: '#2398c2' },
  { id: 'contacted',   label: 'נוצר קשר',     color: '#7e838b' },
  { id: 'qualified',   label: 'מתאים',        color: '#66758f' },
  { id: 'proposal',    label: 'הצעת מחיר',    color: '#b0935f' },
  { id: 'closed_won',  label: 'נסגר בהצלחה',  color: '#1f9d57' },
  { id: 'closed_lost', label: 'אבוד',         color: '#e5484d' },
]

function Toast({ message, onClose }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
      background: 'var(--brand-600)', color: '#fff', padding: '10px 24px',
      borderRadius: 8, fontSize: 14, fontWeight: 500, boxShadow: 'var(--shadow-lg)',
      display: 'flex', alignItems: 'center', gap: 8, animation: 'fadeIn .2s',
    }}>
      <Check size={16} /> {message}
    </div>
  )
}

function useToast() {
  const [msg, setMsg] = useState(null)
  const show = useCallback((text) => {
    setMsg(text)
    setTimeout(() => setMsg(null), 2500)
  }, [])
  return [msg, show]
}

function SettingCard({ title, desc, children }) {
  return (
    <div className="card" style={{ padding: '24px', marginBottom: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        {desc && <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>{desc}</div>}
      </div>
      {children}
    </div>
  )
}

function EditModal({ title, children, onSave, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9990, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div className="card" style={{ padding: 24, width: 420, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
          <button className="btn btn--ghost btn--icon" onClick={onClose} style={{ width: 28, height: 28 }}><X size={16} /></button>
        </div>
        {children}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn btn--outline" onClick={onClose}>ביטול</button>
          <button className="btn btn--primary" onClick={onSave}>שמור</button>
        </div>
      </div>
    </div>
  )
}

function GeneralTab({ toast }) {
  const { t } = useTranslation()
  const fileRef = useRef(null)
  const [logoPreview, setLogoPreview] = useState(null)

  const handleLogoFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLogoPreview(URL.createObjectURL(file))
    settingsApi.uploadLogo(file).catch(() => {})
    toast(t('toast.logoUploaded'))
  }

  const [biz, setBiz] = useState({
    name: 'AutoBiz Pro IL', field: 'טכנולוגיה ושיווק',
    phone: '03-7654321', email: 'info@autobizpro.co.il',
    address: 'רחוב הברזל 30, תל אביב',
  })
  const [locale, setLocale] = useState({ lang: 'עברית', tz: 'Asia/Jerusalem (UTC+3)', currency: '₪ שקל חדש' })

  const set = (key, val) => setBiz(p => ({ ...p, [key]: val }))
  const setL = (key, val) => setLocale(p => ({ ...p, [key]: val }))

  return (
    <div>
      <SettingCard title="פרטי העסק" desc="מידע בסיסי על העסק שלך">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label className="input__label">שם העסק</label>
            <input className="input" value={biz.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="input__label">תחום</label>
            <input className="input" value={biz.field} onChange={e => set('field', e.target.value)} />
          </div>
          <div>
            <label className="input__label">טלפון</label>
            <input className="input" value={biz.phone} onChange={e => set('phone', e.target.value)} dir="ltr" />
          </div>
          <div>
            <label className="input__label">אימייל</label>
            <input className="input" value={biz.email} onChange={e => set('email', e.target.value)} dir="ltr" />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="input__label">כתובת</label>
            <input className="input" value={biz.address} onChange={e => set('address', e.target.value)} />
          </div>
        </div>
      </SettingCard>

      <SettingCard title="לוקליזציה" desc="שפה, אזור זמן ומטבע">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <label className="input__label">שפה</label>
            <select className="input" value={locale.lang} onChange={e => setL('lang', e.target.value)}>
              <option>עברית</option>
              <option>English</option>
              <option>العربية</option>
            </select>
          </div>
          <div>
            <label className="input__label">אזור זמן</label>
            <select className="input" value={locale.tz} onChange={e => setL('tz', e.target.value)}>
              <option>Asia/Jerusalem (UTC+3)</option>
              <option>Europe/London (UTC+0)</option>
              <option>America/New_York (UTC-5)</option>
            </select>
          </div>
          <div>
            <label className="input__label">מטבע</label>
            <select className="input" value={locale.currency} onChange={e => setL('currency', e.target.value)}>
              <option>₪ שקל חדש</option>
              <option>$ דולר</option>
              <option>€ יורו</option>
            </select>
          </div>
        </div>
      </SettingCard>

      <SettingCard title="לוגו">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {logoPreview
            ? <img src={logoPreview} alt="לוגו" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'contain' }} />
            : <div style={{
                width: 64, height: 64, borderRadius: 12, background: 'var(--brand-100)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 700, color: 'var(--brand-600)',
              }}>AB</div>
          }
          <div>
            <input
              ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg"
              style={{ display: 'none' }} onChange={handleLogoFile}
            />
            <button className="btn btn--outline" style={{ fontSize: 13 }} onClick={() => fileRef.current?.click()}>
              העלה לוגו
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 4 }}>PNG, SVG — מקסימום 2MB</div>
          </div>
        </div>
      </SettingCard>

      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 8 }}>
        <button className="btn btn--primary" onClick={() => toast(t('toast.generalSaved'))}>
          <Save size={14} /> שמור שינויים
        </button>
      </div>
    </div>
  )
}

function StatusesTab({ toast }) {
  const { t } = useTranslation()
  const [stages, setStages] = useState([...MOCK_STAGES])
  const [statuses, setStatuses] = useState([...INIT_LEAD_STATUSES])
  const [sources, setSources] = useState(['דף נחיתה', 'גוגל', 'פייסבוק', 'הפניה', 'אתר החברה', 'שיחה נכנסת', 'אינסטגרם', 'לינקדאין'])
  const [newSource, setNewSource] = useState('')
  const [editingStage, setEditingStage] = useState(null)
  const [editingStatus, setEditingStatus] = useState(null)
  const [stageForm, setStageForm] = useState({ name: '', color: '#2398c2' })
  const [statusForm, setStatusForm] = useState({ label: '', color: '#2398c2' })

  const addSource = () => {
    if (newSource.trim() && !sources.includes(newSource.trim())) {
      setSources(p => [...p, newSource.trim()])
      setNewSource('')
      toast(t('toast.sourceAdded'))
    }
  }
  const removeSource = (src) => setSources(p => p.filter(s => s !== src))

  const openEditStage = (stage) => {
    setStageForm({ name: stage.name, color: stage.color })
    setEditingStage(stage.id)
  }
  const saveStage = () => {
    setStages(p => p.map(s => s.id === editingStage ? { ...s, name: stageForm.name, color: stageForm.color } : s))
    setEditingStage(null)
    toast(t('toast.stageUpdated'))
  }
  const deleteStage = (id) => {
    setStages(p => p.filter(s => s.id !== id))
    toast(t('toast.stageDeleted'))
  }
  const addStage = () => {
    const maxOrder = Math.max(0, ...stages.map(s => s.order))
    const maxId = Math.max(0, ...stages.map(s => s.id))
    setStages(p => [...p, { id: maxId + 1, name: 'שלב חדש', color: '#2398c2', order: maxOrder + 1 }])
    toast(t('toast.stageAdded'))
  }

  const openEditStatus = (status) => {
    setStatusForm({ label: status.label, color: status.color })
    setEditingStatus(status.id)
  }
  const saveStatus = () => {
    setStatuses(p => p.map(s => s.id === editingStatus ? { ...s, label: statusForm.label, color: statusForm.color } : s))
    setEditingStatus(null)
    toast(t('toast.statusUpdated'))
  }

  return (
    <div>
      {editingStage !== null && (
        <EditModal title="עריכת שלב" onSave={saveStage} onClose={() => setEditingStage(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="input__label">שם השלב</label>
              <input className="input" value={stageForm.name} onChange={e => setStageForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="input__label">צבע</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={stageForm.color} onChange={e => setStageForm(p => ({ ...p, color: e.target.value }))}
                  style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', borderRadius: 6, padding: 0 }} />
                <input className="input" value={stageForm.color} onChange={e => setStageForm(p => ({ ...p, color: e.target.value }))} dir="ltr" style={{ maxWidth: 120 }} />
              </div>
            </div>
          </div>
        </EditModal>
      )}

      {editingStatus !== null && (
        <EditModal title="עריכת מצב" onSave={saveStatus} onClose={() => setEditingStatus(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="input__label">שם המצב</label>
              <input className="input" value={statusForm.label} onChange={e => setStatusForm(p => ({ ...p, label: e.target.value }))} />
            </div>
            <div>
              <label className="input__label">צבע</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={statusForm.color} onChange={e => setStatusForm(p => ({ ...p, color: e.target.value }))}
                  style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', borderRadius: 6, padding: 0 }} />
                <input className="input" value={statusForm.color} onChange={e => setStatusForm(p => ({ ...p, color: e.target.value }))} dir="ltr" style={{ maxWidth: 120 }} />
              </div>
            </div>
          </div>
        </EditModal>
      )}

      <SettingCard title="שלבי פייפליין" desc="ניהול השלבים בתהליך המכירה">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stages.map((stage) => (
            <div key={stage.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
            }}>
              <GripVertical size={16} style={{ color: 'var(--text-subtle)', cursor: 'grab' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{stage.name}</span>
              <span className="pill" style={{ background: stage.color + '18', color: stage.color, fontSize: 11 }}>שלב {stage.order}</span>
              <button className="btn btn--ghost btn--icon" style={{ width: 28, height: 28 }} onClick={() => openEditStage(stage)}>
                <Pencil size={14} />
              </button>
              <button className="btn btn--ghost btn--icon" style={{ width: 28, height: 28, color: 'var(--danger)' }} onClick={() => deleteStage(stage.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button className="btn btn--outline" style={{ marginTop: 12, fontSize: 13 }} onClick={addStage}>
          <Plus size={14} /> הוסף שלב
        </button>
      </SettingCard>

      <SettingCard title="מצבי ליד" desc="סטטוסים שמוצגים בטבלת הלידים">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {statuses.map((s) => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
            }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{s.label}</span>
              <code style={{ fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'monospace' }}>{s.id}</code>
              <button className="btn btn--ghost btn--icon" style={{ width: 28, height: 28 }} onClick={() => openEditStatus(s)}>
                <Pencil size={14} />
              </button>
            </div>
          ))}
        </div>
      </SettingCard>

      <SettingCard title="מקורות ליד" desc="מאיפה מגיעים הלידים">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {sources.map(src => (
            <span key={src} className="pill" style={{ background: 'var(--brand-50)', color: 'var(--brand-700)', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {src}
              <X size={12} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => removeSource(src)} />
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            className="input" placeholder="הוסף מקור חדש..." style={{ maxWidth: 200 }}
            value={newSource} onChange={e => setNewSource(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSource()}
          />
          <button className="btn btn--outline" style={{ fontSize: 13 }} onClick={addSource}>הוסף</button>
        </div>
      </SettingCard>
    </div>
  )
}

function UsersTab({ toast }) {
  const { t } = useTranslation()
  const [users, setUsers] = useState([...INIT_USERS])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', role: '', status: 'active' })
  const [adding, setAdding] = useState(false)

  const openEdit = (u) => {
    setForm({ name: u.name, email: u.email, role: u.role, status: u.status })
    setEditing(u.id)
  }
  const saveUser = () => {
    if (adding) {
      const maxId = Math.max(0, ...users.map(u => u.id))
      setUsers(p => [...p, { ...form, id: maxId + 1, last_login: '—' }])
      setAdding(false)
      toast(t('toast.userAdded'))
    } else {
      setUsers(p => p.map(u => u.id === editing ? { ...u, ...form } : u))
      setEditing(null)
      toast(t('toast.userUpdated'))
    }
  }
  const openAdd = () => {
    setForm({ name: '', email: '', role: 'נציג מכירות', status: 'active' })
    setAdding(true)
  }

  const toggleStatus = (id) => {
    setUsers(p => p.map(u => u.id === id ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u))
    toast(t('toast.statusToggled'))
  }

  return (
    <div>
      {(editing !== null || adding) && (
        <EditModal title={adding ? 'הוסף משתמש' : 'עריכת משתמש'} onSave={saveUser} onClose={() => { setEditing(null); setAdding(false) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="input__label">שם מלא</label>
              <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="input__label">אימייל</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} dir="ltr" />
            </div>
            <div>
              <label className="input__label">תפקיד</label>
              <select className="input" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                <option>מנהל מערכת</option>
                <option>מנהלת מכירות</option>
                <option>מנהל מכירות</option>
                <option>נציג מכירות</option>
                <option>נציגת מכירות</option>
                <option>צפייה בלבד</option>
              </select>
            </div>
            <div>
              <label className="input__label">סטטוס</label>
              <select className="input" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                <option value="active">פעיל</option>
                <option value="inactive">לא פעיל</option>
              </select>
            </div>
          </div>
        </EditModal>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>ניהול משתמשים</div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>{users.length} משתמשים רשומים</div>
        </div>
        <button className="btn btn--primary" style={{ fontSize: 13 }} onClick={openAdd}>
          <Plus size={14} /> הוסף משתמש
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)', borderBottom: '1px solid var(--border)' }}>משתמש</th>
              <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)', borderBottom: '1px solid var(--border)' }}>תפקיד</th>
              <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)', borderBottom: '1px solid var(--border)' }}>סטטוס</th>
              <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)', borderBottom: '1px solid var(--border)' }}>כניסה אחרונה</th>
              <th style={{ width: 80, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                      {u.name.split(' ').map(w => w[0]).join('')}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-subtle)' }} dir="ltr">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>{u.role}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span className="pill" style={{
                    background: u.status === 'active' ? 'var(--success-bg, #dcfce7)' : 'var(--neutral-100)',
                    color: u.status === 'active' ? 'var(--success, #16a34a)' : 'var(--text-subtle)',
                    cursor: 'pointer',
                  }} onClick={() => toggleStatus(u.id)}>
                    {u.status === 'active' ? 'פעיל' : 'לא פעיל'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-subtle)' }} dir="ltr">{u.last_login}</td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button className="btn btn--ghost btn--icon" style={{ width: 28, height: 28 }} onClick={() => openEdit(u)}>
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16 }}>
        <SettingCard title="תפקידים והרשאות" desc="ניהול תפקידים ורמות גישה">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { name: 'מנהל מערכת', desc: 'גישה מלאה לכל המערכת', count: 1 },
              { name: 'מנהל מכירות', desc: 'ניהול לידים, פייפליין, דוחות', count: 1 },
              { name: 'נציג מכירות', desc: 'צפייה ועריכה של לידים ואנשי קשר', count: 2 },
              { name: 'צפייה בלבד', desc: 'צפייה בדוחות בלבד', count: 0 },
            ].map(r => (
              <div key={r.name} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
              }}>
                <Shield size={16} style={{ color: 'var(--brand-500)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{r.desc}</div>
                </div>
                <span className="pill" style={{ background: 'var(--brand-50)', color: 'var(--brand-600)' }}>
                  {r.count} משתמשים
                </span>
                <button className="btn btn--ghost btn--icon" style={{ width: 28, height: 28 }}>
                  <Pencil size={14} />
                </button>
              </div>
            ))}
          </div>
        </SettingCard>
      </div>
    </div>
  )
}

function IntegrationsTab({ toast }) {
  const { t } = useTranslation()
  const [integrations, setIntegrations] = useState(INIT_INTEGRATIONS)
  const toggle = (id) => {
    setIntegrations(prev => prev.map(i =>
      i.id === id ? { ...i, connected: !i.connected } : i
    ))
    const item = integrations.find(i => i.id === id)
    toast(item.connected ? t('toast.disconnected', { name: item.name }) : t('toast.connected', { name: item.name }))
  }

  return (
    <div>
      <SettingCard title="חיבורים" desc="שירותים חיצוניים המחוברים למערכת">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {integrations.map(int => (
            <div key={int.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              borderRadius: 10, border: '1px solid var(--border)',
              background: int.connected ? 'var(--brand-50)' : 'var(--surface)',
              transition: 'all 0.2s',
            }}>
              <span style={{ fontSize: 24 }}>{int.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{int.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{int.desc}</div>
              </div>
              <button
                onClick={() => toggle(int.id)}
                className={`btn ${int.connected ? 'btn--primary' : 'btn--outline'}`}
                style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}
              >
                {int.connected ? 'מחובר ✓' : 'חבר'}
              </button>
            </div>
          ))}
        </div>
      </SettingCard>

      <SettingCard title="API" desc="ניהול מפתחות API">
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
          borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
        }}>
          <Database size={16} style={{ color: 'var(--text-subtle)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>API Key</div>
            <code style={{ fontSize: 12, color: 'var(--text-subtle)' }} dir="ltr">abp_live_••••••••••••3k7f</code>
          </div>
          <button className="btn btn--outline" style={{ fontSize: 12 }} onClick={() => { navigator.clipboard?.writeText('abp_live_demo_key_3k7f'); toast(t('toast.keyCopied')) }}>העתק</button>
          <button className="btn btn--outline" style={{ fontSize: 12, color: 'var(--danger)' }} onClick={() => toast(t('toast.keyRotated'))}>חדש מפתח</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <Globe size={16} style={{ color: 'var(--text-subtle)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Webhook URL</div>
              <code style={{ fontSize: 12, color: 'var(--text-subtle)' }} dir="ltr">https://api.autobizpro.co.il/webhook/v1</code>
            </div>
            <button className="btn btn--outline" style={{ fontSize: 12 }} onClick={() => toast(t('toast.webhookSaved'))}>ערוך</button>
          </div>
        </div>
      </SettingCard>
    </div>
  )
}

function WhatsAppTab({ whatsappProvider, setWhatsappProvider, whatsappApiKey, setWhatsappApiKey, waPhone, setWaPhone, waDisplay, setWaDisplay, handleSave, canUpdate, toast }) {
  const { t } = useTranslation()
  return (
    <div>
      <SettingCard title="הגדרות WhatsApp" desc="חיבור לספק WhatsApp Business API">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="input__label">ספק</label>
            <select className="input" value={whatsappProvider} onChange={e => setWhatsappProvider(e.target.value)}>
              <option value="">בחר ספק...</option>
              <option value="360dialog">360dialog</option>
              <option value="ultramsg">UltraMsg</option>
              <option value="twilio">Twilio</option>
              <option value="smartsend">SmartSend</option>
            </select>
          </div>
          <div>
            <label className="input__label">API Key</label>
            <input type="password" className="input" value={whatsappApiKey} onChange={e => setWhatsappApiKey(e.target.value)} placeholder="הכנס API key..." dir="ltr" />
          </div>
          <div>
            <label className="input__label">מספר טלפון</label>
            <input className="input" value={waPhone} onChange={e => setWaPhone(e.target.value)} placeholder="+972-50-000-0000" dir="ltr" />
          </div>
          <div>
            <label className="input__label">שם תצוגה</label>
            <input className="input" value={waDisplay} onChange={e => setWaDisplay(e.target.value)} />
          </div>

          <div style={{
            padding: '12px 16px', borderRadius: 8,
            background: 'var(--brand-50)', border: '1px solid var(--brand-200)',
            fontSize: 13, color: 'var(--brand-700)',
          }}>
            לאחר שמירת ההגדרות, שלח הודעת בדיקה כדי לוודא שהחיבור תקין.
          </div>

          {canUpdate && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn--primary"><Save size={14} /> שמור</button>
              <button type="button" className="btn btn--outline" onClick={() => toast(t('toast.testSent'))}>שלח הודעת בדיקה</button>
            </div>
          )}
        </form>
      </SettingCard>
    </div>
  )
}

function NotificationsTab({ toast }) {
  const { t } = useTranslation()
  const [notifs, setNotifs] = useState({
    new_lead: true, lead_assigned: true, deal_closed: true,
    task_reminder: true, daily_report: false, weekly_report: true,
  })
  const toggle = (key) => {
    setNotifs(p => ({ ...p, [key]: !p[key] }))
    toast(notifs[key] ? 'התראה כובתה' : 'התראה הופעלה')
  }

  const items = [
    { key: 'new_lead',       label: 'ליד חדש',          desc: 'התראה כשנכנס ליד חדש למערכת' },
    { key: 'lead_assigned',  label: 'הקצאת ליד',        desc: 'התראה כשליד מוקצה אליך' },
    { key: 'deal_closed',    label: 'עסקה נסגרה',       desc: 'התראה כשעסקה נסגרת בהצלחה' },
    { key: 'task_reminder',  label: 'תזכורת משימה',     desc: 'תזכורת לפני מועד יעד של משימה' },
    { key: 'daily_report',   label: 'דוח יומי',         desc: 'סיכום יומי של פעילות המכירות' },
    { key: 'weekly_report',  label: 'דוח שבועי',        desc: 'סיכום שבועי עם גרפים ומגמות' },
  ]

  return (
    <SettingCard title="העדפות התראות" desc="בחר אילו התראות לקבל">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(n => (
          <div key={n.key} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            borderRadius: 8, cursor: 'pointer',
          }} onClick={() => toggle(n.key)}>
            {notifs[n.key]
              ? <ToggleRight size={24} style={{ color: 'var(--brand-500)', flexShrink: 0 }} />
              : <ToggleLeft size={24} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
            }
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{n.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{n.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-start' }}>
        <button className="btn btn--primary" onClick={() => toast(t('toast.notifsSaved'))}>
          <Save size={14} /> שמור העדפות
        </button>
      </div>
    </SettingCard>
  )
}

function SecurityTab({ toast }) {
  const { t } = useTranslation()
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' })

  const updatePassword = () => {
    if (!passwords.current || !passwords.newPass) return
    if (passwords.newPass !== passwords.confirm) { toast(t('toast.passwordMismatch')); return }
    setPasswords({ current: '', newPass: '', confirm: '' })
    toast(t('toast.passwordUpdated'))
  }

  return (
    <div>
      <SettingCard title="סיסמה" desc="שינוי סיסמת הכניסה">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
          <div>
            <label className="input__label">סיסמה נוכחית</label>
            <input type="password" className="input" placeholder="••••••••"
              value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} />
          </div>
          <div>
            <label className="input__label">סיסמה חדשה</label>
            <input type="password" className="input" placeholder="••••••••"
              value={passwords.newPass} onChange={e => setPasswords(p => ({ ...p, newPass: e.target.value }))} />
          </div>
          <div>
            <label className="input__label">אימות סיסמה</label>
            <input type="password" className="input" placeholder="••••••••"
              value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} />
          </div>
          <button className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={updatePassword}>עדכן סיסמה</button>
        </div>
      </SettingCard>

      <SettingCard title="אימות דו-שלבי (2FA)" desc="הגברת האבטחה עם אימות נוסף">
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
          borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
        }}>
          <Shield size={20} style={{ color: 'var(--text-subtle)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>אימות דו-שלבי</div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>כרגע לא פעיל</div>
          </div>
          <button className="btn btn--outline" style={{ fontSize: 13 }} onClick={() => toast(t('toast.twoFaEnabled'))}>הפעל</button>
        </div>
      </SettingCard>

      <SettingCard title="היסטוריית כניסות" desc="כניסות אחרונות לחשבון">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { date: '03/06/2026 09:12', ip: '85.130.xx.xx', device: 'Chrome · Windows' },
            { date: '02/06/2026 17:45', ip: '85.130.xx.xx', device: 'Chrome · Windows' },
            { date: '01/06/2026 08:30', ip: '37.142.xx.xx', device: 'Safari · iPhone' },
          ].map((l, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '10px 12px',
              borderRadius: 6, fontSize: 13,
            }}>
              <span style={{ color: 'var(--text-subtle)', minWidth: 130 }} dir="ltr">{l.date}</span>
              <span style={{ color: 'var(--text-subtle)', minWidth: 110 }} dir="ltr">{l.ip}</span>
              <span dir="ltr">{l.device}</span>
            </div>
          ))}
        </div>
      </SettingCard>
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const { can }    = useAuth()
  const qc         = useQueryClient()
  const [tab, setTab] = useState('general')

  const TABS = [
    { id: 'general',       label: t('settings.tabs.general'),       icon: Settings },
    { id: 'statuses',      label: t('settings.tabs.statuses'),      icon: Palette },
    { id: 'users',         label: t('settings.tabs.users'),         icon: Users },
    { id: 'integrations',  label: t('settings.tabs.integrations'),  icon: Link2 },
    { id: 'whatsapp',      label: t('settings.tabs.whatsapp'),      icon: MessageSquare },
    { id: 'notifications', label: t('settings.tabs.notifications'), icon: Bell },
    { id: 'security',      label: t('settings.tabs.security'),      icon: Shield },
  ]
  const [toastMsg, showToast] = useToast()

  const { data: tenantData } = useQuery({
    queryKey: ['settings-tenant'],
    queryFn:  () => client.get('/settings/tenant').then(r => r.data.data),
  })

  const [whatsappProvider, setWhatsappProvider] = useState('')
  const [whatsappApiKey, setWhatsappApiKey]     = useState('')
  const [waPhone, setWaPhone]                   = useState('')
  const [waDisplay, setWaDisplay]               = useState('AutoBiz Pro IL')

  const saveTenant = useMutation({
    mutationFn: (data) => client.put('/settings/tenant', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['settings-tenant'] }),
  })

  const handleSave = (e) => {
    e.preventDefault()
    saveTenant.mutate({
      settings: {
        whatsapp_provider: whatsappProvider,
        whatsapp_api_key:  whatsappApiKey,
      },
    })
    showToast(t('toast.whatsappSaved'))
  }

  return (
    <div style={{ display: 'flex', gap: 24, minHeight: 'calc(100vh - 120px)' }}>
      {toastMsg && <Toast message={toastMsg} />}

      <div style={{
        width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14,
                fontWeight: active ? 600 : 400, textAlign: 'right',
                background: active ? 'var(--brand-50)' : 'transparent',
                color: active ? 'var(--brand-600)' : 'var(--text)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--neutral-50)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <Icon size={16} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1, maxWidth: 720 }}>
        {tab === 'general'       && <GeneralTab toast={showToast} />}
        {tab === 'statuses'      && <StatusesTab toast={showToast} />}
        {tab === 'users'         && <UsersTab toast={showToast} />}
        {tab === 'integrations'  && <IntegrationsTab toast={showToast} />}
        {tab === 'whatsapp'      && <WhatsAppTab
          whatsappProvider={whatsappProvider} setWhatsappProvider={setWhatsappProvider}
          whatsappApiKey={whatsappApiKey} setWhatsappApiKey={setWhatsappApiKey}
          waPhone={waPhone} setWaPhone={setWaPhone}
          waDisplay={waDisplay} setWaDisplay={setWaDisplay}
          handleSave={handleSave} canUpdate={can('users', 'can_update')} toast={showToast}
        />}
        {tab === 'notifications' && <NotificationsTab toast={showToast} />}
        {tab === 'security'      && <SecurityTab toast={showToast} />}
      </div>
    </div>
  )
}
