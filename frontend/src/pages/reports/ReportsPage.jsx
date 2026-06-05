import { useState } from 'react'
import { TrendingUp, TrendingDown, Download } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const nis = (n) => '₪' + n.toLocaleString('en-US')

const MONTHLY = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'].map((m, i) => ({
  name: m,
  revenue: [42,58,51,74,69,88,96,112,104,128,119,145][i] * 1000,
  deals:   [4, 6, 5, 8, 7, 9, 10,12,11, 14, 13, 16][i],
}))

const FUNNEL = [
  { label: 'לידים נכנסו',  value: 840, color: 'var(--chart-1)' },
  { label: 'נוצר קשר',     value: 612, color: 'var(--brand-400)' },
  { label: 'הצעת מחיר',    value: 348, color: 'var(--brand-300)' },
  { label: 'משא ומתן',     value: 196, color: 'var(--lime-500,#9bcf24)' },
  { label: 'נסגר בהצלחה',  value: 118, color: 'var(--lime-400,#b1e239)' },
]

const SOURCES = [
  { name: 'דף נחיתה',  value: 312 },
  { name: 'גוגל',      value: 228 },
  { name: 'פייסבוק',   value: 184 },
  { name: 'הפניה',     value: 97  },
  { name: 'שיחה נכנסת', value: 56 },
]

const LEADERBOARD = [
  { name: 'דנה כהן',  deals: 24, revenue: 486000, win: 38 },
  { name: 'אבי רז',   deals: 19, revenue: 392000, win: 33 },
  { name: 'מאיה לוי', deals: 16, revenue: 341000, win: 29 },
  { name: 'רון גל',   deals: 13, revenue: 268000, win: 26 },
]

const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 },
}

function Delta({ up, children }) {
  return (
    <span className={'delta ' + (up ? 'delta--up' : 'delta--down')}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{children}
    </span>
  )
}

function CardHead({ title, sub, children }) {
  return (
    <div className="card__head" style={{ paddingBottom: 4, alignItems: 'flex-start' }}>
      <div>
        <div className="card__title">{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--text-subtle)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flex: 1 }} />
      {children}
    </div>
  )
}

function Kpi({ label, value, up, delta, note }) {
  return (
    <div className="card kpi">
      <div className="kpi__top"><span className="kpi__label">{label}</span></div>
      <div className="kpi__value tnum">{value}</div>
      <div className="kpi__foot"><Delta up={up}>{delta}</Delta>{note}</div>
    </div>
  )
}

export default function ReportsPage() {
  const [range, setRange] = useState('שנה')
  const data = range === 'שנה' ? MONTHLY : MONTHLY.slice(-3)

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div className="seg">
          {['רבעון', 'חצי שנה', 'שנה'].map(r => (
            <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn--outline btn--sm" onClick={() => window.print()}>
          <Download size={14} />ייצוא PDF
        </button>
      </div>

      {/* KPI row */}
      <div className="dash-grid kpi-row" style={{ marginBottom: 16 }}>
        <Kpi label="סה״כ הכנסות"    value={nis(1486000)} up delta="24%"  note="לעומת שנה קודמת" />
        <Kpi label="עסקאות שנסגרו"  value="118"          up delta="18%"  note="הרבעון הנוכחי" />
        <Kpi label="גודל עסקה ממוצע" value={nis(12593)}  up delta="5%"   note="מדיאן: ₪9,800" />
        <Kpi label="מחזור מכירות"   value="32 יום"       up={false} delta="3 ימים" note="ממוצע צוות" />
      </div>

      {/* Charts row 1 */}
      <div className="dash-grid chart-row-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <CardHead title="הכנסות חודשיות" sub="₪ אלפים" />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="rg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--chart-1)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} orientation="right" axisLine={false} tickLine={false}
                  tickFormatter={v => `₪${(v/1000).toFixed(0)}k`} />
                <Tooltip {...TOOLTIP_STYLE} formatter={v => nis(v)} />
                <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2.4} fill="url(#rg1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Funnel */}
        <div className="card">
          <CardHead title="משפך המרה" sub="לידים → עסקאות" />
          <div className="card__body" style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FUNNEL.map((s, i) => {
              const pct  = Math.round((s.value / FUNNEL[0].value) * 100)
              const conv = i === 0 ? null : Math.round((s.value / FUNNEL[i - 1].value) * 100)
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-subtle)' }}>{s.label}</span>
                    <span style={{ fontWeight: 700 }}>{s.value.toLocaleString('en-US')}{conv != null && <span style={{ color: s.color, marginInlineStart: 6 }}>{conv}%</span>}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', borderRadius: 999, background: s.color, transition: 'width .4s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="dash-grid chart-row-eq" style={{ marginBottom: 16 }}>
        <div className="card">
          <CardHead title="לידים לפי מקור" />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={SOURCES} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="value" fill="var(--chart-2,#b1e239)" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <CardHead title="עסקאות לפי חודש" />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} orientation="right" axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="deals" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card__head">
          <div className="card__title">לוח מובילי מכירות</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['דירוג', 'נציג', 'עסקאות', 'הכנסות', 'אחוז סגירה'].map(h => (
                <th key={h} style={{ textAlign: 'right', padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEADERBOARD.map((rep, i) => (
              <tr key={rep.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    display: 'inline-flex', width: 24, height: 24, borderRadius: '50%',
                    background: i === 0 ? 'var(--lime-400,#b1e239)' : 'var(--surface-2)',
                    color: i === 0 ? '#1b1f25' : 'var(--text-subtle)',
                    fontWeight: 700, fontSize: 12, alignItems: 'center', justifyContent: 'center',
                  }}>{i + 1}</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                      {rep.name.split(' ').map(w => w[0]).join('')}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{rep.name}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 600 }} className="tnum">{rep.deals}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600 }} className="tnum">{nis(rep.revenue)}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 60, height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                      <div style={{ width: rep.win + '%', height: '100%', background: 'var(--brand-500)', borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{rep.win}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
