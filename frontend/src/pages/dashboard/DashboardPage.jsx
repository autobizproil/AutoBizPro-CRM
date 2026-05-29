import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../api/dashboard'
import { leadsApi } from '../../api/leads'

export default function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn:  () => dashboardApi.stats().then(r => r.data.data),
  })
  const { data: recentData } = useQuery({
    queryKey: ['leads-recent'],
    queryFn:  () => leadsApi.list({ per_page: 5 }).then(r => r.data.data),
  })

  const recent = recentData?.data ?? []

  const cards = [
    { label: 'סה״כ לידים',   value: stats?.total_leads   ?? 0, icon: '👥', color: 'indigo' },
    { label: 'לידים היום',   value: stats?.new_leads      ?? 0, icon: '🆕', color: 'green'  },
    { label: 'אנשי קשר',     value: stats?.total_contacts ?? 0, icon: '📋', color: 'blue'   },
    { label: 'לידים פתוחים', value: stats?.open_leads     ?? 0, icon: '🔓', color: 'amber'  },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">דשבורד</h1>
        <p className="text-sm text-gray-500 mt-1">סקירה כללית של המערכת</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">{label}</p>
                <p className="text-3xl font-bold text-gray-900">{value}</p>
              </div>
              <span className="text-2xl">{icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads by stage */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">לידים לפי שלב</h3>
          <div className="space-y-3">
            {(stats?.leads_by_stage ?? []).map((item) => (
              <div key={item.pipeline_stage_id} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.stage?.color ?? '#6366f1' }} />
                <span className="text-sm text-gray-600 flex-1">{item.stage?.name ?? 'ללא שלב'}</span>
                <span className="font-semibold text-gray-900 text-sm">{item.total}</span>
                <div className="w-24 bg-gray-100 rounded-full h-1.5">
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
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">לידים אחרונים</h3>
          <div className="space-y-2">
            {recent.map(lead => (
              <div key={lead.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: lead.stage?.color ?? '#6366f1' }}>
                  {lead.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{lead.name}</p>
                  <p className="text-xs text-gray-500">{lead.phone ?? lead.email ?? '—'}</p>
                </div>
                {lead.stage && (
                  <span className="text-xs px-2 py-0.5 rounded-full text-white flex-shrink-0"
                    style={{ backgroundColor: lead.stage.color }}>
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
