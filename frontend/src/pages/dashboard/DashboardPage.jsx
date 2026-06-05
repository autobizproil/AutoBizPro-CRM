import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useDashboardStats, useDashboardChart } from '../../hooks/useDashboard'
import {
  Users, DollarSign, Target, CheckCircle2, TrendingUp, TrendingDown, Plus,
  Phone, Send, CheckCheck,
} from 'lucide-react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const activity = [
  { icon: CheckCheck, text: <>העסקה עם <b>אבי נחום</b> נסגרה בהצלחה — ₪22,000</>, time: 'לפני 24 דקות' },
  { icon: Phone,      text: <>שיחת היכרות תועדה עבור <b>מאיה לוי</b></>,         time: 'לפני שעה' },
  { icon: Send,       text: <>הצעת מחיר נשלחה ל<b>דנה בר</b></>,                 time: 'לפני 3 שעות' },
  { icon: Users,      text: <>5 לידים חדשים נכנסו מ<b>דף הנחיתה</b></>,          time: 'היום, 09:14' },
]

const DONUT_COLORS = ['#2398c2', '#7e838b', '#66758f', '#b0935f', '#1f9d57']

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, fontSize: 13,
  }
}

function Delta({ up, children }) {
  return (
    <span className={'delta ' + (up ? 'delta--up' : 'delta--down')}>
      {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      {children}
    </span>
  )
}

function Kpi({ icon: Ico, tint, label, value, up, delta, note }) {
  return (
    <div className="card kpi">
      <div className="kpi__top">
        <span className="kpi__icon" style={tint}><Ico size={18} /></span>
        <span className="kpi__label">{label}</span>
      </div>
      <div className="kpi__value tnum">{value}</div>
      <div className="kpi__foot"><Delta up={up}>{delta}</Delta>{note}</div>
    </div>
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

export default function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [range, setRange] = useState(t('dashboard.year'))
  const { data: stats }  = useDashboardStats()
  const { data: charts } = useDashboardChart(range)

  const leadsData   = charts?.leads_by_month  ?? []
  const revenueData = charts?.revenue_by_month ?? []
  const repData     = charts?.reps             ?? []
  const sourceData  = charts?.leads_by_source  ?? []
  const donutData   = charts?.leads_by_stage   ?? []

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div className="seg">
          {[t('dashboard.week'), t('dashboard.month'), t('dashboard.year')].map(r => (
            <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
        <button className="btn btn--accent" onClick={() => navigate('/leads')}><Plus size={16} />{t('dashboard.createLead')}</button>
      </div>

      <div className="dash-grid kpi-row" style={{ marginBottom: 16 }}>
        <Kpi icon={Users}
          tint={{ background: 'var(--brand-50)', color: 'var(--brand-600)' }}
          label={t('dashboard.kpi.newLeads')}
          value={stats?.total_leads ?? 128}
          up delta={`${stats?.new_leads_delta ?? 18}%`} note="לעומת החודש שעבר" />
        <Kpi icon={DollarSign}
          tint={{ background: 'var(--lime-100)', color: 'var(--lime-700)' }}
          label={t('dashboard.kpi.openQuotes')}
          value={<>₪ {stats?.open_quotes_value ?? '247,500'}</>}
          up delta={`${stats?.quotes_delta ?? 12}%`}
          note={`${stats?.open_quotes_count ?? 34} הצעות`} />
        <Kpi icon={Target}
          tint={{ background: 'var(--amber-50,#fffbeb)', color: 'var(--amber-600,#d97706)' }}
          label={t('dashboard.kpi.closeRate')}
          value={`${stats?.close_rate ?? 32}%`}
          up={false} delta={`${stats?.close_rate_delta ?? 4}%`} note="ממוצע צוות" />
        <Kpi icon={CheckCircle2}
          tint={{ background: 'var(--green-50,#f0fdf4)', color: 'var(--green-600,#16a34a)' }}
          label={t('dashboard.kpi.dealsWon')}
          value={stats?.deals_won ?? 24}
          up delta={`${stats?.deals_won_delta ?? 9}%`} note="הרבעון" />
      </div>

      <div className="dash-grid chart-row-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <CardHead title={t('dashboard.charts.leadsTrend')} sub="8 חודשים אחרונים" />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={236}>
              <LineChart data={leadsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} orientation="right" axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2.4}
                  dot={{ r: 3, fill: 'var(--surface)', stroke: 'var(--chart-1)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <CardHead title={t('dashboard.charts.leadsByStage')} />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={236}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={68} outerRadius={96}
                  dataKey="value" paddingAngle={2}>
                  {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="legend-inline" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              {donutData.map((d, i) => (
                <span key={i} className="li">
                  <span className="sw" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dash-grid chart-row-eq" style={{ marginBottom: 16 }}>
        <div className="card">
          <CardHead title={t('dashboard.charts.revenue')} sub="₪ אלפים" />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--chart-1)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} orientation="right" axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2.4} fill="url(#grad1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <CardHead title={t('dashboard.charts.repPerf')} />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={repData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="dash-grid chart-row-eq">
        <div className="card">
          <CardHead title={t('dashboard.charts.bySource')} />
          <div className="card__body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sourceData} layout="vertical">
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
          <CardHead title={t('dashboard.charts.activity')} />
          <div className="card__body">
            <div className="timeline">
              {activity.map((a, i) => (
                <div key={i} className="timeline__item">
                  <div className="timeline__dot"><a.icon size={13} /></div>
                  <div className="timeline__body">
                    <div style={{ fontSize: 13 }}>{a.text}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 2 }}>{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
