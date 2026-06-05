import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Download, Plus, Search, MoreHorizontal, Users, DollarSign, TrendingUp as Trend, Target } from 'lucide-react'
import { MOCK_OWNERS } from '../../api/mockData'

const STATUS = {
  active: { label: 'פעיל',   cls: 'won'  },
  risk:   { label: 'בסיכון', cls: 'wait' },
  paused: { label: 'מוקפא',  cls: 'talk' },
  churn:  { label: 'נטש',    cls: 'lost' },
}

const PLANS = { basic: 'בסיסי', pro: 'מקצועי', biz: 'עסקי', ent: 'ארגוני' }

const CUSTOMERS = [
  { id: 1,  company: 'נחום ובניו',       contact: 'אבי נחום',    mgr: 1, plan: 'biz',   mrr: 3200, since: 'מאי 2024', renew: 'מאי 2026', status: 'active', health: 92 },
  { id: 2,  company: 'Levin Logistics',  contact: 'איתי לוין',   mgr: 0, plan: 'ent',   mrr: 8400, since: 'ינו 2023', renew: 'ינו 2026', status: 'active', health: 88 },
  { id: 3,  company: 'גבאי נדל״ן',       contact: 'הילה גבאי',   mgr: 2, plan: 'pro',   mrr: 1800, since: 'ספט 2024', renew: 'ספט 2025', status: 'risk',   health: 54 },
  { id: 4,  company: 'Biton Auto',       contact: 'עומר ביטון',  mgr: 1, plan: 'biz',   mrr: 2900, since: 'מרץ 2024', renew: 'מרץ 2026', status: 'active', health: 79 },
  { id: 5,  company: 'ברק טכנולוגיות',   contact: 'ליאת ברק',    mgr: 0, plan: 'ent',   mrr: 9600, since: 'יונ 2022', renew: 'יונ 2026', status: 'active', health: 95 },
  { id: 6,  company: 'שמש דיגיטל',       contact: 'יעל שמש',     mgr: 3, plan: 'pro',   mrr: 1500, since: 'נוב 2024', renew: 'נוב 2025', status: 'active', health: 71 },
  { id: 7,  company: 'אדרי תקשורת',      contact: 'קרן אדרי',    mgr: 2, plan: 'basic', mrr: 690,  since: 'פבר 2025', renew: 'פבר 2026', status: 'paused', health: 40 },
  { id: 8,  company: 'דהן עיצוב פנים',   contact: 'שירה דהן',    mgr: 3, plan: 'basic', mrr: 490,  since: 'אפר 2025', renew: 'אפר 2026', status: 'active', health: 67 },
  { id: 9,  company: 'Harel Build',      contact: 'גיא הראל',    mgr: 1, plan: 'pro',   mrr: 2100, since: 'אוג 2023', renew: 'אוג 2025', status: 'risk',   health: 48 },
  { id: 10, company: 'Mizrahi Foods',    contact: 'יוסי מזרחי',  mgr: 0, plan: 'biz',   mrr: 3600, since: 'אוק 2023', renew: 'אוק 2025', status: 'active', health: 83 },
  { id: 11, company: 'כספי השקעות',      contact: 'רון כספי',    mgr: 2, plan: 'pro',   mrr: 1200, since: 'דצמ 2024', renew: 'דצמ 2025', status: 'churn',  health: 12 },
  { id: 12, company: 'Peled Ventures',   contact: 'דניאל פלד',   mgr: 1, plan: 'ent',   mrr: 7200, since: 'יול 2023', renew: 'יול 2025', status: 'active', health: 90 },
]

const nis = (n) => '₪ ' + n.toLocaleString('en-US')

function Health({ v }) {
  const color = v >= 75 ? 'var(--green-500,#22c55e)' : v >= 50 ? 'var(--amber-500,#f59e0b)' : 'var(--red-500,#ef4444)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 96 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ width: v + '%', height: '100%', borderRadius: 999, background: color }} />
      </div>
      <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color, width: 28, textAlign: 'start' }}>{v}</span>
    </div>
  )
}

function StatusPill({ s }) {
  const t = STATUS[s]
  return (
    <span className={`pill pill--${t.cls}`}>
      <span className="dot" />
      {t.label}
    </span>
  )
}

function Kpi({ icon: Ico, tint, label, value, sub }) {
  return (
    <div className="card kpi">
      <div className="kpi__top">
        <span className="kpi__icon" style={tint}><Ico size={18} /></span>
        <span className="kpi__label">{label}</span>
      </div>
      <div className="kpi__value tnum">{value}</div>
      <div className="kpi__foot">{sub}</div>
    </div>
  )
}

export default function CustomersPage() {
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [sort, setSort] = useState({ col: 'mrr', dir: 'desc' })
  const [showForm, setShowForm] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ company: '', contact: '', plan: 'basic', mrr: '' })
  const [customerList, setCustomerList] = useState(CUSTOMERS)

  const handleCreate = (e) => {
    e.preventDefault()
    const entry = {
      id: Date.now(),
      company: newCustomer.company,
      contact: newCustomer.contact,
      mgr: 0,
      plan: newCustomer.plan,
      mrr: Number(newCustomer.mrr) || 0,
      since: new Date().toLocaleDateString('he-IL', { month: 'short', year: 'numeric' }),
      renew: new Date(Date.now() + 365 * 86400000).toLocaleDateString('he-IL', { month: 'short', year: 'numeric' }),
      status: 'active',
      health: 80,
    }
    setCustomerList(prev => [entry, ...prev])
    setShowForm(false)
    setNewCustomer({ company: '', contact: '', plan: 'basic', mrr: '' })
  }

  const activeC  = customerList.filter(c => c.status !== 'churn')
  const totalMrr = activeC.reduce((s, c) => s + c.mrr, 0)
  const atRisk   = customerList.filter(c => c.status === 'risk').length

  const tabs = [
    { k: 'all',    label: 'הכל',    n: customerList.length },
    { k: 'active', label: 'פעילים', n: customerList.filter(c => c.status === 'active').length },
    { k: 'risk',   label: 'בסיכון', n: customerList.filter(c => c.status === 'risk').length },
    { k: 'churn',  label: 'נטשו',   n: customerList.filter(c => c.status === 'churn').length },
  ]

  const rows = useMemo(() => {
    let r = customerList.filter(c => {
      if (statusF !== 'all' && c.status !== statusF) return false
      if (q && !(c.company + c.contact).toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    r = [...r].sort((a, b) => {
      if (sort.col === 'company') return dir * a.company.localeCompare(b.company, 'he')
      return (a[sort.col] - b[sort.col]) * dir
    })
    return r
  }, [q, statusF, sort])

  const toggleSort = (col) => setSort(s => ({
    col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc',
  }))

  const SortIcon = ({ col }) => {
    if (sort.col !== col) return <span style={{ opacity: 0.3, fontSize: 10 }}>↕</span>
    return <span style={{ fontSize: 10 }}>{sort.dir === 'desc' ? '↓' : '↑'}</span>
  }

  const tints = {
    blue:  { background: 'var(--brand-50)',   color: 'var(--brand-600)' },
    lime:  { background: 'var(--lime-100)',   color: 'var(--lime-700)'  },
    green: { background: 'var(--green-50,#f0fdf4)', color: 'var(--green-600,#16a34a)' },
    amber: { background: 'var(--amber-50,#fffbeb)', color: 'var(--amber-600,#d97706)' },
  }

  return (
    <>
      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 18 }}>
        <Kpi icon={Users}   tint={tints.blue}  label="לקוחות פעילים"     value={activeC.length}  sub="מתוך 12 חשבונות" />
        <Kpi icon={DollarSign} tint={tints.lime} label="הכנסה חודשית (MRR)" value={nis(totalMrr)}
          sub={<span><span className="delta delta--up" style={{ marginInlineEnd: 6 }}><TrendingUp size={12} />6%</span>לעומת חודש שעבר</span>} />
        <Kpi icon={Trend}   tint={tints.green} label="הכנסה שנתית (ARR)"  value={nis(totalMrr * 12)} sub="צפי 12 חודשים" />
        <Kpi icon={Target}  tint={tints.amber} label="חשבונות בסיכון"     value={atRisk}          sub="דורשים טיפול" />
      </div>

      {/* Toolbar */}
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="search" style={{ flex: '1 1 260px', maxWidth: 340 }}>
          <Search size={15} />
          <input className="input" placeholder="חיפוש לקוח..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button
              key={t.k}
              onClick={() => setStatusF(t.k)}
              style={{
                border: 'none', background: statusF === t.k ? 'var(--primary-soft,var(--brand-50))' : 'none',
                color: statusF === t.k ? 'var(--primary,var(--brand-600))' : 'var(--text-subtle)',
                fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
                padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                transition: 'background .12s, color .12s',
              }}
            >
              {t.label}
              <span style={{
                fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '1px 7px', minWidth: 20, textAlign: 'center',
                background: statusF === t.k ? 'var(--brand-600)' : 'var(--surface-2)',
                color: statusF === t.k ? '#fff' : 'var(--text-subtle)',
              }}>{t.n}</span>
            </button>
          ))}
        </div>
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn--outline btn--sm" onClick={() => {
            const csv = ['חברה,איש קשר,תוכנית,MRR,סטטוס', ...rows.map(c => `${c.company},${c.contact},${PLANS[c.plan]},${c.mrr},${STATUS[c.status].label}`)].join('\n')
            const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'customers.csv'; a.click()
          }}><Download size={14} />ייצוא</button>
          <button className="btn btn--accent btn--sm" onClick={() => setShowForm(true)}><Plus size={14} />לקוח חדש</button>
        </div>
      </div>

      {/* New customer form */}
      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>לקוח חדש</div>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="input__label">שם חברה *</label>
                <input className="input" required value={newCustomer.company}
                  onChange={e => setNewCustomer(p => ({ ...p, company: e.target.value }))} />
              </div>
              <div>
                <label className="input__label">איש קשר</label>
                <input className="input" value={newCustomer.contact}
                  onChange={e => setNewCustomer(p => ({ ...p, contact: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="input__label">תוכנית</label>
              <select className="input" value={newCustomer.plan}
                onChange={e => setNewCustomer(p => ({ ...p, plan: e.target.value }))}>
                {Object.entries(PLANS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="input__label">MRR (₪)</label>
              <input className="input" type="number" placeholder="0" value={newCustomer.mrr}
                onChange={e => setNewCustomer(p => ({ ...p, mrr: e.target.value }))} dir="ltr" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" className="btn btn--primary">שמור</button>
              <button type="button" className="btn btn--outline" onClick={() => setShowForm(false)}>ביטול</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table className="tbl" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort('company')}>
                חברה <SortIcon col="company" />
              </th>
              <th>תוכנית</th>
              <th className="sortable" style={{ textAlign: 'start' }} onClick={() => toggleSort('mrr')}>
                MRR <SortIcon col="mrr" />
              </th>
              <th style={{ width: 150 }}>בריאות חשבון</th>
              <th className="sortable" onClick={() => toggleSort('status')}>
                סטטוס <SortIcon col="status" />
              </th>
              <th>חידוש</th>
              <th style={{ width: 64 }}>מנהל</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => {
              const owner = MOCK_OWNERS[c.mgr % MOCK_OWNERS.length]
              const initials = owner?.name.split(' ').map(w => w[0]).join('').slice(0, 2) || '?'
              const logoLetters = c.company.replace(/[^A-Za-zא-ת]/g, '').slice(0, 2)
              return (
                <tr key={c.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span style={{
                        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                        display: 'grid', placeItems: 'center',
                        fontWeight: 700, fontSize: 12,
                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                        color: 'var(--text-subtle)', textTransform: 'uppercase',
                      }}>{logoLetters}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>{c.company}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>{c.contact} · לקוח מ{c.since}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="badge">{PLANS[c.plan]}</span></td>
                  <td style={{ fontWeight: 600, textAlign: 'start' }} className="tnum">{nis(c.mrr)}</td>
                  <td><Health v={c.health} /></td>
                  <td><StatusPill s={c.status} /></td>
                  <td style={{ color: 'var(--text-subtle)', whiteSpace: 'nowrap', fontSize: 13 }}>{c.renew}</td>
                  <td>
                    <div className="avatar" style={{ width: 26, height: 26, fontSize: 11 }} title={owner?.name}>{initials}</div>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn--ghost btn--icon btn--sm">
                      <MoreHorizontal size={15} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-subtle)' }}>
                  לא נמצאו לקוחות
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
