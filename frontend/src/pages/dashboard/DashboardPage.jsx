import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../api/dashboard'

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn:  () => dashboardApi.stats().then(r => r.data.data),
  })

  if (isLoading) return <div className="text-gray-500">טוען...</div>

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">דשבורד</h2>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="סה״כ לידים"     value={stats?.total_leads    ?? 0} color="indigo" />
        <StatCard label="לידים חדשים"    value={stats?.new_leads       ?? 0} color="green" />
        <StatCard label="אנשי קשר"        value={stats?.total_contacts  ?? 0} color="purple" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-700 mb-4">לידים לפי שלב</h3>
        <div className="space-y-2">
          {(stats?.leads_by_stage ?? []).map((item) => (
            <div key={item.pipeline_stage_id} className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.stage?.color ?? '#6366f1' }}
              />
              <span className="text-sm text-gray-600">{item.stage?.name ?? 'ללא שלב'}</span>
              <span className="mr-auto font-semibold text-gray-900">{item.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700',
    green:  'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
  }
  return (
    <div className={`rounded-xl p-5 ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm mt-1 opacity-80">{label}</div>
    </div>
  )
}
