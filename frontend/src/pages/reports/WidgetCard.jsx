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
import { isLegacyWidget, widgetDataParams, pivotSeriesRows } from '../../lib/widgetConfig'
import DrillDownModal from './DrillDownModal'
import MetricsTableWidget from './MetricsTableWidget'

// ── Constants ────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#2398c2', '#b1e239', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

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

const TICK  = '#9ca3af'
const GRID  = '#374151'
const TT_STYLE = { borderRadius: '8px', border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', fontSize: 11 }

function ChartBar({ data, color, preview, onSegmentClick, seriesLabels, stacked }) {
  if (!data?.length) return <Empty />
  const h = preview ? 160 : 220
  const hasMultiBars = data[0]?.open !== undefined && data[0]?.closed !== undefined
  const nameKey = Object.keys(data[0] ?? {}).find(k =>
    ['name', 'agent_name', 'source', 'stage'].includes(k)
  ) ?? 'name'

  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} strokeOpacity={0.4} />
          <XAxis dataKey={nameKey} tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TT_STYLE} />
          {seriesLabels ? (
            <>
              {seriesLabels.map((label, i) => (
                <Bar key={label} dataKey={label} name={label} fill={PIE_COLORS[i % PIE_COLORS.length]}
                  radius={[4, 4, 0, 0]} stackId={stacked ? 'stack' : undefined} />
              ))}
              <Legend formatter={v => <span style={{ fontSize: 11, color: TICK }}>{v}</span>} />
            </>
          ) : hasMultiBars ? (
            <>
              <Bar dataKey="total"  name="סה״כ"    fill="#2398c2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="open"   name="פתוחים"  fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="closed" name="סגורים"  fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Legend formatter={v => <span style={{ fontSize: 11, color: TICK }}>{v}</span>} />
            </>
          ) : (
            <Bar dataKey="total" fill={color ?? '#2398c2'} radius={[4, 4, 0, 0]}
              cursor={onSegmentClick ? 'pointer' : 'default'}
              onClick={onSegmentClick ? (d) => onSegmentClick(d?.key ?? d?.name ?? null) : undefined} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartBarH({ data, color, preview, onSegmentClick, seriesLabels, stacked }) {
  if (!data?.length) return <Empty />
  const h = preview ? 160 : 240
  const nameKey = Object.keys(data[0] ?? {}).find(k =>
    ['typeLabel', 'name', 'agent_name', 'source', 'stage'].includes(k)
  ) ?? 'name'

  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={h}>
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 32, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} strokeOpacity={0.4} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey={nameKey} tick={{ fontSize: 11, fill: TICK }} axisLine={false} tickLine={false} width={70} />
          <Tooltip contentStyle={TT_STYLE} />
          {seriesLabels ? (
            <>
              {seriesLabels.map((label, i) => (
                <Bar key={label} dataKey={label} name={label} fill={PIE_COLORS[i % PIE_COLORS.length]}
                  radius={[0, 4, 4, 0]} stackId={stacked ? 'stack' : undefined} />
              ))}
              <Legend formatter={v => <span style={{ fontSize: 11, color: TICK }}>{v}</span>} />
            </>
          ) : (
            <Bar dataKey="total" fill={color ?? '#8b5cf6'} radius={[0, 4, 4, 0]}
              cursor={onSegmentClick ? 'pointer' : 'default'}
              onClick={onSegmentClick ? (d) => onSegmentClick(d?.key ?? d?.name ?? null) : undefined} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartPie({ data, preview, onSegmentClick }) {
  if (!data?.length) return <Empty />
  const h = preview ? 160 : 220
  const total = data.reduce((s, d) => s + (d.total ?? 0), 0)
  const nameKey = Object.keys(data[0] ?? {}).find(k =>
    ['source', 'name', 'typeLabel', 'type'].includes(k)
  ) ?? 'source'

  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={h}>
        <PieChart>
          <Pie data={data} dataKey="total" nameKey={nameKey} cx="50%" cy="50%"
            outerRadius={preview ? 60 : 85} labelLine={false} label={makePieLabel(total)}
            cursor={onSegmentClick ? 'pointer' : 'default'}
            onClick={onSegmentClick ? (d) => onSegmentClick(d?.key ?? d?.name ?? null) : undefined}>
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TT_STYLE} />
          {!preview && (
            <Legend formatter={v => <span style={{ fontSize: 11, color: TICK }}>{v}</span>} />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartLine({ data, color, preview, onSegmentClick }) {
  if (!data?.length) return <Empty />
  const h = preview ? 160 : 220
  const formatted = data.map(d => ({
    ...d,
    date: d.date ? d.date.slice(5).replace('-', '/') : d.date,
  }))

  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={h}>
        <LineChart data={formatted} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} strokeOpacity={0.4} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TT_STYLE} />
          <Line type="monotone" dataKey="total" stroke={color ?? '#2398c2'} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartTable({ data, onSegmentClick }) {
  if (!data?.length) return <Empty />
  const cols = Object.keys(data[0] ?? {}).filter(k =>
    !['user_id', 'stage_id', 'color', 'key'].includes(k)
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
          <tr className="border-b border-gray-100 dark:border-gray-700">
            {cols.map(c => (
              <th key={c} className="text-right py-2 px-1 text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">
                {colLabel[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700">
              {cols.map(c => (
                <td key={c} className="py-1.5 px-1 text-gray-700 dark:text-gray-200">{row[c] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Per-widget date override ─────────────────────────────────────────────────

function DateOverridePopover({ widget, onUpdate }) {
  const [open, setOpen] = useState(false)
  const active = !!(widget.dateFrom || widget.dateTo || widget.period)

  if (!onUpdate || !isLegacyWidget(widget)) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title={active ? 'טווח תאריכים מותאם ל-widget זה' : 'התאם טווח תאריכים ל-widget זה'}
        className={`text-xs leading-none ${active ? 'text-[#2398c2]' : 'text-gray-300 hover:text-gray-500'}`}
      >
        🕐
      </button>
      {open && (
        <div
          className="absolute left-0 top-6 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 w-52 space-y-2"
          onMouseLeave={() => setOpen(false)}
        >
          <label className="block text-[11px] text-gray-500 dark:text-gray-400">
            מתאריך
            <input
              type="date"
              value={widget.dateFrom ?? ''}
              onChange={e => onUpdate(widget.id, { dateFrom: e.target.value, period: '' })}
              className="w-full mt-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 bg-transparent"
            />
          </label>
          <label className="block text-[11px] text-gray-500 dark:text-gray-400">
            עד תאריך
            <input
              type="date"
              value={widget.dateTo ?? ''}
              onChange={e => onUpdate(widget.id, { dateTo: e.target.value, period: '' })}
              className="w-full mt-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 bg-transparent"
            />
          </label>
          {active && (
            <button
              onClick={() => onUpdate(widget.id, { dateFrom: '', dateTo: '', period: '' })}
              className="text-[11px] text-[#2398c2] hover:underline"
            >
              נקה — כל הזמן
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function formatCreatedAt(createdAt) {
  if (!createdAt) return null
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function KpiCard({ widget, onDelete, data, isLoading }) {
  const [hovered, setHovered] = useState(false)
  const value  = typeof data === 'number' ? data : (data?.[0]?.total ?? '—')
  const target = widget.target
  const pct    = (typeof value === 'number' && target > 0) ? Math.min(100, (value / target) * 100) : null
  const createdLabel = formatCreatedAt(widget.createdAt)

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 flex-1 min-w-[140px] relative"
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
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{widget.title}</p>
          <p className="text-3xl font-bold tabular-nums" style={{ color: widget.color ?? '#2398c2' }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {pct !== null && (
            <>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">יעד: {target.toLocaleString()}</p>
              <div className="mt-1.5 h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: widget.color ?? '#2398c2' }} />
              </div>
            </>
          )}
          {createdLabel && (
            <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-2">נוצר בתאריך: {createdLabel}</p>
          )}
        </>
      )}
    </div>
  )
}

// ── Chart widget card ─────────────────────────────────────────────────────────

function ChartWidgetCard({ widget, onDelete, onUpdate, data, isLoading, resolvedRange, seriesLabels }) {
  const [hovered, setHovered]   = useState(false)
  const [drillDown, setDrillDown] = useState(null)

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 relative ${
        widget.dataSource === 'timeline' ? 'lg:col-span-2' : ''
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{widget.title}</h3>
        {hovered && (
          <div className="flex items-center gap-2">
            <DateOverridePopover widget={widget} onUpdate={onUpdate} />
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-gray-300 hover:text-red-400 text-lg leading-none"
                title="הסר widget"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>
      {isLoading ? <Skeleton /> : renderChart(widget, data, key => setDrillDown({ key, label: key ?? 'ריק' }), seriesLabels)}
      {drillDown && (
        <DrillDownModal
          widget={widget}
          segment={drillDown}
          resolvedRange={resolvedRange}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  )
}

function renderChart(widget, data, onSegmentClick, seriesLabels) {
  switch (widget.type) {
    case 'bar':   return <ChartBar  data={data} color={widget.color} onSegmentClick={onSegmentClick} seriesLabels={seriesLabels} stacked={widget.variant === 'stacked'} />
    case 'bar_h': return <ChartBarH data={data} color={widget.color} onSegmentClick={onSegmentClick} seriesLabels={seriesLabels} stacked={widget.variant === 'stacked'} />
    case 'pie':   return <ChartPie  data={data} onSegmentClick={onSegmentClick} />
    case 'line':  return <ChartLine data={data} color={widget.color} onSegmentClick={onSegmentClick} />
    case 'table': return <ChartTable data={data} onSegmentClick={onSegmentClick} />
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
        <p className="text-3xl font-bold tabular-nums" style={{ color: widget.color ?? '#2398c2' }}>
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

export default function WidgetCard({ widget, onDelete, onUpdate, dateParams, preview = false }) {
  const isMetricsTable = widget.type === 'metrics_table'
  const legacy = isLegacyWidget(widget)

  // A widget with its own filter (period/date/conditions) ignores the board's global range.
  // Legacy preset widgets keep their per-report fetchers; new entity widgets
  // go through the generic aggregation endpoint.
  const legacyParams = {
    ...((widget.period || widget.dateFrom || widget.dateTo)
      ? {
          period:    widget.period || undefined,
          date_from: widget.dateFrom || undefined,
          date_to:   widget.dateTo || undefined,
        }
      : (dateParams ?? {})),
    ...(widget.conditions?.length ? { conditions: JSON.stringify(widget.conditions) } : {}),
  }

  const newParams = legacy ? null : widgetDataParams(widget)

  const { data, isLoading } = useQuery({
    queryKey: legacy
      ? ['widget', widget.dataSource, legacyParams.period, legacyParams.date_from, legacyParams.date_to, legacyParams.conditions]
      : ['widget-data', newParams],
    queryFn: () => legacy
      ? fetchWidgetData(widget.dataSource, legacyParams)
      : dashboardApi.widgetData(newParams).then(r => {
          const payload = r.data.data
          // KPI widgets read a single number; charts read the grouped rows plus
          // the resolved date range (drill-down needs it to scope its own query).
          if (widget.type === 'kpi') return payload.total
          const rows = payload.seriesKeys
            ? pivotSeriesRows(payload.rows, payload.seriesKeys)
            : payload.rows.map(row => ({ name: row.label, key: row.key, total: row.total, color: row.color }))
          return {
            rows,
            seriesLabels: payload.seriesKeys?.map(s => s.label) ?? null,
            resolvedRange: payload.resolvedRange ?? null,
          }
        }),
    staleTime: 60_000,
    enabled: !isMetricsTable,
  })

  if (isMetricsTable) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 ${preview ? '' : 'lg:col-span-2'}`}>
        {!preview && <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{widget.title}</h3>}
        <MetricsTableWidget tiles={widget.tiles} createdAt={widget.createdAt} />
      </div>
    )
  }

  if (preview) {
    const previewData = legacy ? data : (widget.type === 'kpi' ? data : data?.rows)
    return (
      <div className="w-full">
        {renderPreviewChart(widget, previewData, isLoading)}
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

  const chartData     = legacy ? data : data?.rows
  const resolvedRange = legacy ? null : data?.resolvedRange
  const seriesLabels  = legacy ? null : data?.seriesLabels

  return (
    <ChartWidgetCard
      widget={widget}
      onDelete={onDelete}
      onUpdate={onUpdate}
      data={chartData}
      isLoading={isLoading}
      resolvedRange={resolvedRange}
      seriesLabels={seriesLabels}
    />
  )
}

// Re-export for use in AddWidgetModal preview
export { fetchWidgetData, PIE_COLORS, TYPE_LABELS }
