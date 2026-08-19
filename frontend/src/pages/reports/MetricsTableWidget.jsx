import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../api/dashboard'
import { widgetDataParams, widgetCaption } from '../../lib/widgetConfig'

function formatCreatedAt(createdAt) {
  if (!createdAt) return null
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function MetricTile({ tile, createdLabel, meta }) {
  const { data, isLoading } = useQuery({
    queryKey: ['metrics-tile', tile],
    queryFn:  () => dashboardApi.widgetData(widgetDataParams(tile)).then(r => r.data.data.total),
    staleTime: 60_000,
  })
  const caption = widgetCaption(tile, meta)

  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1 truncate">{tile.title}</p>
      <p className="text-xl font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {isLoading ? '…' : (typeof data === 'number' ? data.toLocaleString() : '—')}
      </p>
      {caption?.aggLine && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{caption.aggLine}</p>
      )}
      {caption?.periodLine && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500">{caption.periodLine}</p>
      )}
      {createdLabel && (
        <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">נוסף בתאריך: {createdLabel}</p>
      )}
    </div>
  )
}

// Individual tiles are entries in one widget's config, not their own DB rows —
// they all share the widget's own creation timestamp.
export default function MetricsTableWidget({ tiles, createdAt }) {
  const { data: meta } = useQuery({
    queryKey: ['widget-fields'],
    queryFn:  () => dashboardApi.widgetFields().then(r => r.data.data),
    staleTime: 5 * 60_000,
  })

  if (!tiles?.length) {
    return <p className="text-sm text-gray-400 text-center py-8">אין מדדים בטבלה זו — ערוך את ה-widget כדי להוסיף</p>
  }

  const createdLabel = formatCreatedAt(createdAt)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {tiles.map((tile, i) => <MetricTile key={i} tile={tile} createdLabel={createdLabel} meta={meta} />)}
    </div>
  )
}
