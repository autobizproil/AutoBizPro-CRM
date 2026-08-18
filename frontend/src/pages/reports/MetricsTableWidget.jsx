import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../api/dashboard'
import { widgetDataParams } from '../../lib/widgetConfig'

function MetricTile({ tile }) {
  const { data, isLoading } = useQuery({
    queryKey: ['metrics-tile', tile],
    queryFn:  () => dashboardApi.widgetData(widgetDataParams(tile)).then(r => r.data.data.total),
    staleTime: 60_000,
  })

  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1 truncate">{tile.title}</p>
      <p className="text-xl font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {isLoading ? '…' : (typeof data === 'number' ? data.toLocaleString() : '—')}
      </p>
    </div>
  )
}

export default function MetricsTableWidget({ tiles }) {
  if (!tiles?.length) {
    return <p className="text-sm text-gray-400 text-center py-8">אין מדדים בטבלה זו — ערוך את ה-widget כדי להוסיף</p>
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {tiles.map((tile, i) => <MetricTile key={i} tile={tile} />)}
    </div>
  )
}
