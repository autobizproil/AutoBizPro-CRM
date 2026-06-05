import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../api/dashboard'
import { MOCK_DASHBOARD_CHART } from '../api/mockData'

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.stats()
      .then(r => r.data.data)
      .catch(() => MOCK_DASHBOARD_CHART.stats),
    placeholderData: MOCK_DASHBOARD_CHART.stats,
  })
}

export function useDashboardChart(range) {
  return useQuery({
    queryKey: ['dashboard', 'chart', range],
    queryFn: () => dashboardApi.chartData(range)
      .then(r => r.data.data)
      .catch(() => MOCK_DASHBOARD_CHART),
    placeholderData: MOCK_DASHBOARD_CHART,
  })
}
