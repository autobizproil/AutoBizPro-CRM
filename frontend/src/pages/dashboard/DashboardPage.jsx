import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { dashboardApi } from '../../api/dashboard'
import { leadsApi } from '../../api/leads'

const PERIODS = [
  { value: 'today',   label: 'היום'   },
  { value: 'week',    label: 'שבוע'   },
  { value: 'month',   label: 'חודש'   },
  { value: 'quarter', label: 'רבעון'  },
  { value: 'year',    label: 'שנה'    },
]

function formatDateLabel(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

export default function DashboardPage() {
  const [period, setPeriod] = useState('month')

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn:  () => dashboardApi.stats().then(r => r.data.data),
  })

  const { data: recentData } = useQuery({
    queryKey: ['leads-recent'],
    queryFn:  () => leadsApi.list({ per_page: 5 }).then(r => r.data.data),
  })

  const { data: chartRaw } = useQuery({
    queryKey: ['dashboard-chart', period],
    queryFn:  () => dashboardApi.chartData({ period }).then(r => r.data.data ?? r.data),
  })

  const { data: sourceRaw } = useQuery({
    queryKey: ['reports-source', period],
    queryFn:  () => dashboardApi.reportsBySource({ period }).then(r => r.data.data ?? r.data),
  })

  const recent = recentData?.data ?? []

  const chartData = (Array.isArray(chartRaw) ? chartRaw : []).map(item => ({
    ...item,
    dateLabel: formatDateLabel(item.date ?? item.label),
  }))

  const sourceData = Array.isArray(sourceRaw) ? sourceRaw : []

  const cards = [
    { label: 'סה״כ לידים',   value: stats?.total_leads   ?? 0, icon: '👥', color: 'indigo', strip: '#2398c2' },
    { label: 'לידים היום',   value: stats?.new_leads      ?? 0, icon: '🆕', color: 'green',  strip: '#22c55e' },
    { label: 'אנשי קשר',     value: stats?.total_contacts ?? 0, icon: '📋', color: 'blue',   strip: '#3b82f6' },
    { label: 'לידים פתוחים', value: stats?.open_leads     ?? 0, icon: '🔓', color: 'amber',  strip: '#f59e0b' },
  ]

  const colorMap = {
    indigo: 'text-[#2398c2] bg-[#2398c2]/10 dark:bg-[#2398c2]/20',
    green:  'text-green-600 bg-green-50 dark:bg-green-900/30',
    blue:   'text-blue-600 bg-blue-50 dark:bg-blue-900/30',
    amber:  'text-amber-600 bg-amber-50 dark:bg-amber-900/30',
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">דשבורד</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">סקירה כללית של המערכת</p>
      </div>

      {/* Period selector */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 w-fit">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              period === p.value
                ? 'bg-white dark:bg-gray-800 text-[#2398c2] shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, icon, color, strip }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="h-1 w-full" style={{ backgroundColor: strip }} />
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{value.toLocaleString('he-IL')}</p>
                </div>
                <span className={`text-xl p-2 rounded-lg ${colorMap[color]}`}>{icon}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {/* Line chart — leads over time */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">לידים לאורך זמן</h3>
          {chartData.length > 0 ? (
            <div dir="ltr">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', fontSize: 12 }} labelStyle={{ color: '#d1d5db' }} formatter={(v) => [v, 'לידים']} />
                  <Line type="monotone" dataKey="count" stroke="#2398c2" strokeWidth={2.5} dot={{ r: 3, fill: '#2398c2', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">אין נתונים לתקופה זו</div>
          )}
        </div>

        {/* Horizontal bar chart — leads by source */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">לידים לפי מקור</h3>
          {sourceData.length > 0 ? (
            <div dir="ltr">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart layout="vertical" data={sourceData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="source" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', fontSize: 12 }} formatter={(v) => [v, 'לידים']} />
                  <Bar dataKey="total" fill="#b1e239" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">אין נתונים לתקופה זו</div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads by stage */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">לידים לפי שלב</h3>
          <div className="space-y-3">
            {(stats?.leads_by_stage ?? []).map((item) => (
              <div key={item.pipeline_stage_id} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.stage?.color ?? '#6366f1' }} />
                <span className="text-sm text-gray-600 dark:text-gray-300 flex-1">{item.stage?.name ?? 'ללא שלב'}</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{item.total}</span>
                <div className="w-24 bg-gray-100 dark:bg-gray-600 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full"
                    style={{
                      backgroundColor: item.stage?.color ?? '#6366f1',
                      width: `${Math.min(100, (item.total / Math.max(stats?.total_leads, 1)) * 100)}%`
                    }} />
                </div>
              </div>
            ))}
            {(stats?.leads_by_stage ?? []).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">אין נתונים</p>
            )}
          </div>
        </div>

        {/* Recent leads */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">לידים אחרונים</h3>
          <div className="space-y-2">
            {recent.map(lead => (
              <div key={lead.id} className="flex items-center gap-3 py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: lead.stage?.color ?? '#2398c2' }}>
                  {lead.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{lead.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{lead.phone ?? lead.email ?? '—'}</p>
                </div>
                {lead.stage && (
                  <span className="inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 whitespace-nowrap flex-shrink-0"
                    style={{
                      backgroundColor: `${lead.stage.color}18`,
                      color: lead.stage.color,
                      border: `1px solid ${lead.stage.color}40`,
                    }}>
                    {lead.stage.name}
                  </span>
                )}
              </div>
            ))}
            {recent.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">אין לידים עדיין</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
