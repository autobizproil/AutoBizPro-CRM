import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../api/dashboard'
import { drillDownEntityRoute, drillDownParams } from '../../lib/widgetConfig'

const ENTITY_TABLE_COLUMNS = {
  lead:    [['name', 'שם'], ['phone', 'טלפון'], ['email', 'אימייל'], ['source', 'מקור'], ['status', 'סטטוס']],
  client:  [['name', 'שם'], ['phone', 'טלפון'], ['email', 'אימייל'], ['company', 'חברה']],
  contact: [['name', 'שם'], ['phone', 'טלפון'], ['email', 'אימייל'], ['company', 'חברה']],
  task:    [['title', 'כותרת'], ['status', 'סטטוס'], ['priority', 'עדיפות']],
}

export default function DrillDownModal({ widget, segment, resolvedRange, onClose }) {
  const route = drillDownEntityRoute(widget.entity)

  const { data, isLoading } = useQuery({
    queryKey: ['drill-down', widget.entity, widget.displayField, segment?.key, resolvedRange?.from, resolvedRange?.to],
    queryFn:  () => dashboardApi.entityList(route, drillDownParams(widget, segment, resolvedRange))
      .then(r => {
        const raw = r.data?.data
        return Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : [])
      }),
    enabled: !!route,
  })

  const columns = ENTITY_TABLE_COLUMNS[widget.entity] ?? []
  const title = segment?.label ? `${widget.title} - ${segment.label}` : widget.title

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col overflow-hidden" dir="rtl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!route ? (
            <p className="text-sm text-gray-400 text-center py-8">אין תצוגת רשימה זמינה לישות זו</p>
          ) : isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">טוען...</p>
          ) : !data?.length ? (
            <p className="text-sm text-gray-400 text-center py-8">אין רשומות תואמות</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  {columns.map(([key, label]) => (
                    <th key={key} className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                    {columns.map(([key]) => (
                      <td key={key} className="py-2 px-2 text-gray-700 dark:text-gray-200">{row[key] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
