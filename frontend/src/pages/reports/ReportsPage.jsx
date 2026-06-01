import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { dashboardApi } from '../../api/dashboard'

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

const ACTIVITY_TYPE_LABELS = {
  call:     'שיחה',
  note:     'הערה',
  email:    'מייל',
  meeting:  'פגישה',
  task:     'משימה',
  whatsapp: 'וואטסאפ',
  payment:  'תשלום',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function monthAgoStr() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

function pct(num, denom) {
  if (!denom) return '0%'
  return `${Math.round((num / denom) * 100)}%`
}

// Custom label for pie chart — show Hebrew name
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }) => {
  if (percent < 0.05) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(monthAgoStr())
  const [dateTo,   setDateTo]   = useState(todayStr())

  const params = { date_from: dateFrom, date_to: dateTo }

  const { data: sourceRaw, isLoading: loadingSource } = useQuery({
    queryKey: ['reports-source', dateFrom, dateTo],
    queryFn:  () => dashboardApi.reportsBySource(params).then(r => r.data.data ?? r.data),
  })

  const { data: agentRaw, isLoading: loadingAgent } = useQuery({
    queryKey: ['reports-agent', dateFrom, dateTo],
    queryFn:  () => dashboardApi.reportsByAgent(params).then(r => r.data.data ?? r.data),
  })

  const { data: activitiesRaw, isLoading: loadingActivities } = useQuery({
    queryKey: ['reports-activities', dateFrom, dateTo],
    queryFn:  () => dashboardApi.reportsActivities(params).then(r => r.data.data ?? r.data),
  })

  const { data: conversionRaw, isLoading: loadingConversion } = useQuery({
    queryKey: ['reports-conversion', dateFrom, dateTo],
    queryFn:  () => dashboardApi.reportsConversion(params).then(r => r.data.data ?? r.data),
  })

  const sourceData     = Array.isArray(sourceRaw)     ? sourceRaw     : []
  const agentData      = Array.isArray(agentRaw)      ? agentRaw      : []
  const activitiesData = (Array.isArray(activitiesRaw) ? activitiesRaw : []).map(item => ({
    ...item,
    typeLabel: ACTIVITY_TYPE_LABELS[item.type] ?? item.type,
  }))
  const conversionData = Array.isArray(conversionRaw) ? conversionRaw : []

  const sourceTotal = sourceData.reduce((s, i) => s + (i.total ?? 0), 0)

  // Max conversion value for relative bar widths
  const conversionMax = conversionData.reduce((m, i) => Math.max(m, i.total ?? i.count ?? 0), 1)

  function handleExport() {
    dashboardApi.exportLeads(params).then(r => {
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv;charset=utf-8;' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `leads_export_${dateFrom}_${dateTo}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }).catch(() => {
      alert('שגיאה בייצוא הנתונים')
    })
  }

  return (
    <div dir="rtl">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">דוחות</h1>
          <p className="text-sm text-gray-500 mt-1">ניתוח נתונים ומדדים</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
            <label className="text-xs text-gray-500 whitespace-nowrap">מתאריך</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-sm text-gray-700 outline-none bg-transparent"
            />
          </div>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
            <label className="text-xs text-gray-500 whitespace-nowrap">עד תאריך</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-sm text-gray-700 outline-none bg-transparent"
            />
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-sm transition-colors"
          >
            <span>📥</span>
            ייצוא CSV
          </button>
        </div>
      </div>

      {/* 2×2 report grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. Leads by source — PieChart + table */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">לידים לפי מקור</h3>
          {loadingSource ? (
            <Skeleton />
          ) : sourceData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    dataKey="total"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    labelLine={false}
                    label={renderCustomLabel}
                  >
                    {sourceData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                    formatter={(v, n) => [v, n]}
                  />
                  <Legend
                    formatter={(value) => <span style={{ fontSize: 12, color: '#374151' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-right py-2 pr-1 text-gray-500 font-medium">מקור</th>
                      <th className="text-right py-2 text-gray-500 font-medium">סה״כ</th>
                      <th className="text-right py-2 text-gray-500 font-medium">אחוז</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceData.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="py-2 pr-1">
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            {row.source ?? '—'}
                          </span>
                        </td>
                        <td className="py-2 font-semibold text-gray-900">{row.total}</td>
                        <td className="py-2 text-gray-500">{pct(row.total, sourceTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Empty />
          )}
        </div>

        {/* 2. Leads by agent — BarChart + table */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">לידים לפי נציג</h3>
          {loadingAgent ? (
            <Skeleton />
          ) : agentData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={agentData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="agent_name"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                    formatter={(v, n) => [v, n === 'total' ? 'סה״כ' : n === 'open' ? 'פתוח' : 'סגור']}
                  />
                  <Legend
                    formatter={(value) => (
                      <span style={{ fontSize: 12, color: '#374151' }}>
                        {value === 'total' ? 'סה״כ' : value === 'open' ? 'פתוח' : 'סגור'}
                      </span>
                    )}
                  />
                  <Bar dataKey="total"  fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="open"   fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="closed" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-right py-2 pr-1 text-gray-500 font-medium">נציג</th>
                      <th className="text-right py-2 text-gray-500 font-medium">סה״כ</th>
                      <th className="text-right py-2 text-gray-500 font-medium">פתוחים</th>
                      <th className="text-right py-2 text-gray-500 font-medium">סגורים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentData.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="py-2 pr-1 font-medium text-gray-800">{row.agent_name ?? '—'}</td>
                        <td className="py-2 font-semibold text-gray-900">{row.total ?? 0}</td>
                        <td className="py-2 text-green-600">{row.open ?? 0}</td>
                        <td className="py-2 text-amber-600">{row.closed ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Empty />
          )}
        </div>

        {/* 3. Activities by type — horizontal BarChart */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">פעילויות לפי סוג</h3>
          {loadingActivities ? (
            <Skeleton />
          ) : activitiesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                layout="vertical"
                data={activitiesData}
                margin={{ top: 4, right: 32, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="typeLabel"
                  tick={{ fontSize: 12, fill: '#374151' }}
                  axisLine={false}
                  tickLine={false}
                  width={65}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                  formatter={(v) => [v, 'פעילויות']}
                />
                <Bar dataKey="total" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </div>

        {/* 4. Conversion funnel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">משפך המרה</h3>
          {loadingConversion ? (
            <Skeleton />
          ) : conversionData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={conversionData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="stage"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                    formatter={(v, n) => [
                      n === 'conversion_rate' ? `${v}%` : v,
                      n === 'conversion_rate' ? 'אחוז המרה' : 'סה״כ',
                    ]}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Funnel visual — stacked horizontal bars */}
              <div className="mt-5 space-y-2">
                {conversionData.map((stage, i) => {
                  const widthPct = Math.round(((stage.total ?? stage.count ?? 0) / conversionMax) * 100)
                  const funnel_colors = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff']
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-28 flex-shrink-0 truncate">{stage.stage ?? stage.name}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                        <div
                          className="h-5 rounded-full flex items-center px-2 transition-all duration-500"
                          style={{
                            width: `${Math.max(widthPct, 4)}%`,
                            backgroundColor: funnel_colors[i % funnel_colors.length],
                          }}
                        >
                          {widthPct > 15 && (
                            <span className="text-white text-xs font-semibold">{stage.total ?? stage.count ?? 0}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-left flex-shrink-0">
                        {stage.conversion_rate != null ? `${stage.conversion_rate}%` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <Empty />
          )}
        </div>

      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3 py-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" style={{ width: `${70 + i * 8}%` }} />
      ))}
    </div>
  )
}

function Empty() {
  return (
    <div className="flex items-center justify-center h-48 text-gray-400 text-sm">אין נתונים לתקופה זו</div>
  )
}
