import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { dashboardApi } from '../../api/dashboard'

// ── Constants ────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

const TYPE_LABELS = {
  call: 'שיחה', note: 'הערה', email: 'מייל',
  meeting: 'פגישה', task: 'משימה', whatsapp: 'וואטסאפ', payment: 'תשלום',
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchWidgetData(dataSource, params) {
  switch (dataSource) {
    case 'leads_by_source': {
      const r = await dashboardApi.reportsBySource(params)
      return (r.data.data ?? r.data) || []
    }
    case 'leads_by_agent': {
      const r = await dashboardApi.reportsByAgent(params)
      const raw = (r.data.data ?? r.data) || []
      // Normalize: API returns agent_name — map to name for chart consistency
      return raw.map(row => ({ ...row, name: row.name ?? row.agent_name ?? 'לא משויך' }))
    }
    case 'activities': {
      const r = await dashboardApi.reportsActivities(params)
      const raw = (r.data.data ?? r.data) || []
      return raw.map(item => ({
        ...item,
        typeLabel: TYPE_LABELS[item.type] ?? item.type,
      }))
    }
    case 'conversion': {
      const r = await dashboardApi.reportsConversion(params)
      const raw = r.data.data ?? r.data
      // Endpoint returns { funnel: [...], total_entered: N } or flat array
      if (Array.isArray(raw)) return raw
      if (raw && Array.isArray(raw.funnel)) return raw.funnel
      return []
    }
    case 'timeline': {
      const r = await dashboardApi.chartData(params)
      const raw = r.data.data ?? r.data
      if (Array.isArray(raw)) return raw
      if (raw && Array.isArray(raw.leads_per_day)) return raw.leads_per_day
      return []
    }
    case 'leads_by_stage': {
      const r = await dashboardApi.stats()
      const stageRows = r.data?.data?.leads_by_stage ?? []
      return stageRows.map(s => ({
        name: s.stage?.name ?? s.pipeline_stage_id ?? '?',
        total: s.total ?? 0,
        color: s.stage?.color ?? '#6366f1',
      }))
    }
    // KPI single-value sources
    case 'kpi_total': {
      const r = await dashboardApi.stats()
      return r.data?.data?.total_leads ?? 0
    }
    case 'kpi_new': {
      const r = await dashboardApi.stats()
      return r.data?.data?.new_leads ?? 0
    }
    case 'kpi_open': {
      const r = await dashboardApi.stats()
      return r.data?.data?.open_leads ?? 0
    }
    case 'kpi_contacts': {
      const r = await dashboardApi.stats()
      return r.data?.data?.total_contacts ?? 0
    }
    // Legacy aliases (for any boards saved with old keys)
    case 'kpi_total_leads': {
      const r = await dashboardApi.stats()
      return r.data?.data?.total_leads ?? 0
    }
    case 'kpi_new_leads': {
      const r = await dashboardApi.stats()
      return r.data?.data?.new_leads ?? 0
    }
    case 'kpi_open_leads': {
      const r = await dashboardApi.stats()
      return r.data?.data?.open_leads ?? 0
    }
    default:
      return []
  }
}

// ── Pie label (avoids Recharts percent-field collision) ───────────────────────

function makePieLabel(total) {
  return ({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
    if (!total || value / total < 0.05) return null
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
        {`${Math.round(value / total * 100)}%`}
      </text>
    )
  }
}

// ── Skeleton + Empty ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3 py-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
      ))}
    </div>
  )
}

function Empty() {
  return (
    <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
      אין נתונים לתקופה זו
    </div>
  )
}

// ── Chart renderers ───────────────────────────────────────────────────────────

function ChartBar({ data, color, preview }) {
  if (!data?.length) return <Empty />
  const h = preview ? 160 : 220

  // For leads_by_agent: multi-bar (total, open, closed)
  const hasMultiBars = data[0]?.open !== undefined && data[0]?.closed !== undefined
  const nameKey = Object.keys(data[0] ?? {}).find(k =>
    ['name', 'agent_name', 'source', 'stage'].includes(k)
  ) ?? 'name'

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={nameKey} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 11 }} />
        {hasMultiBars ? (
          <>
            <Bar dataKey="total" name="סה״כ" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="open"  name="פתוחים" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="closed" name="סגורים" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Legend formatter={v => <span style={{ fontSize: 11, color: '#374151' }}>{v}</span>} />
          </>
        ) : (
          <Bar dataKey="total" fill={color ?? '#6366f1'} radius={[4, 4, 0, 0]} />
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}

function ChartBarH({ data, color, preview }) {
  if (!data?.length) return <Empty />
  const h = preview ? 160 : 240
  // For activities, prefer typeLabel for display
  const nameKey = Object.keys(data[0] ?? {}).find(k =>
    ['typeLabel', 'name', 'agent_name', 'source', 'stage'].includes(k)
  ) ?? 'name'

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 32, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey={nameKey} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={65} />
        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 11 }} />
        <Bar dataKey="total" fill={color ?? '#8b5cf6'} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ChartPie({ data, preview }) {
  if (!data?.length) return <Empty />
  const h = preview ? 160 : 220
  const total = data.reduce((s, d) => s + (d.total ?? 0), 0)
  const nameKey = Object.keys(data[0] ?? {}).find(k =>
    ['source', 'name', 'typeLabel', 'type'].includes(k)
  ) ?? 'source'

  return (
    <ResponsiveContainer width="100%" height={h}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          outerRadius={preview ? 60 : 85}
          labelLine={false}
          label={makePieLabel(total)}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 11 }} />
        {!preview && (
          <Legend formatter={v => <span style={{ fontSize: 11, color: '#374151' }}>{v}</span>} />
        )}
      </PieChart>
    </ResponsiveContainer>
  )
}

function ChartLine({ data, color, preview }) {
  if (!data?.length) return <Empty />
  const h = preview ? 160 : 220

  // Format date as DD/MM
  const formatted = data.map(d => ({
    ...d,
    date: d.date ? d.date.slice(5).replace('-', '/') : d.date,
  }))

  return (
    <ResponsiveContainer width="100%" height={h}>
      <LineChart data={formatted} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 11 }} />
        <Line type="monotone" dataKey="total" stroke={color ?? '#6366f1'} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function ChartTable({ data }) {
  if (!data?.length) return <Empty />
  const cols = Object.keys(data[0] ?? {}).filter(k =>
    !['user_id', 'stage_id', 'color'].includes(k)
  )

  const colLabel = {
    name: 'שם', agent_name: 'נציג', source: 'מקור', total: 'סה״כ',
    open: 'פתוחים', closed: 'סגורים', typeLabel: 'סוג', type: 'סוג',
    rate: 'שיעור', pct: 'אחוז', date: 'תאריך',
  }

  return (
    <div className="overflow-auto max-h-56">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            {cols.map(c => (
              <th key={c} className="text-right py-2 px-1 text-gray-500 font-medium whitespace-nowrap">
                {colLabel[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
              {cols.map(c => (
                <td key={c} className="py-1.5 px-1 text-gray-700">{row[c] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ widget, onDelete, data, isLoading }) {
  const [hovered, setHovered] = useState(false)
  const value = typeof data === 'number' ? data : (data?.[0]?.total ?? '—')

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex-1 min-w-[140px] relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-2 left-2 text-gray-300 hover:text-red-400 text-sm leading-none"
          title="הסר widget"
        >
          ×
        </button>
      )}
      {isLoading ? (
        <Skeleton />
      ) : (
        <>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{widget.title}</p>
          <p className="text-3xl font-bold tabular-nums" style={{ color: widget.color ?? '#6366f1' }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </>
      )}
    </div>
  )
}

// ── Chart widget card ─────────────────────────────────────────────────────────

function ChartWidgetCard({ widget, onDelete, data, isLoading }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 relative ${
        widget.dataSource === 'timeline' ? 'lg:col-span-2' : ''
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{widget.title}</h3>
        {hovered && onDelete && (
          <button
            onClick={onDelete}
            className="text-gray-300 hover:text-red-400 text-lg leading-none ml-2"
            title="הסר widget"
          >
            ×
          </button>
        )}
      </div>
      {isLoading ? <Skeleton /> : renderChart(widget, data)}
    </div>
  )
}

function renderChart(widget, data) {
  switch (widget.type) {
    case 'bar':   return <ChartBar  data={data} color={widget.color} />
    case 'bar_h': return <ChartBarH data={data} color={widget.color} />
    case 'pie':   return <ChartPie  data={data} />
    case 'line':  return <ChartLine data={data} color={widget.color} />
    case 'table': return <ChartTable data={data} />
    default:      return <Empty />
  }
}

function renderPreviewChart(widget, data, isLoading) {
  if (isLoading) return <Skeleton />
  if (widget.type === 'kpi') {
    const value = typeof data === 'number' ? data : (data?.[0]?.total ?? '—')
    return (
      <div className="flex flex-col items-start py-3">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{widget.title || 'כותרת'}</p>
        <p className="text-3xl font-bold tabular-nums" style={{ color: widget.color ?? '#6366f1' }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
      </div>
    )
  }
  switch (widget.type) {
    case 'bar':   return <ChartBar  data={data} color={widget.color} preview />
    case 'bar_h': return <ChartBarH data={data} color={widget.color} preview />
    case 'pie':   return <ChartPie  data={data} preview />
    case 'line':  return <ChartLine data={data} color={widget.color} preview />
    case 'table': return <ChartTable data={data} />
    default:      return <Empty />
  }
}

// ── Main WidgetCard export ────────────────────────────────────────────────────

export default function WidgetCard({ widget, onDelete, dateParams, preview = false }) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget', widget.dataSource, dateParams?.date_from, dateParams?.date_to],
    queryFn: () => fetchWidgetData(widget.dataSource, dateParams ?? {}),
    staleTime: 60_000,
  })

  if (preview) {
    return (
      <div className="w-full">
        {renderPreviewChart(widget, data, isLoading)}
      </div>
    )
  }

  if (widget.type === 'kpi') {
    return (
      <KpiCard
        widget={widget}
        onDelete={onDelete}
        data={data}
        isLoading={isLoading}
      />
    )
  }

  return (
    <ChartWidgetCard
      widget={widget}
      onDelete={onDelete}
      data={data}
      isLoading={isLoading}
    />
  )
}

// Re-export for use in AddWidgetModal preview
export { fetchWidgetData, PIE_COLORS, TYPE_LABELS }
