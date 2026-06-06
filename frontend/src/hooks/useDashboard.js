import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../api/dashboard'
import { MOCK_DASHBOARD_CHART, CHART_BY_RANGE } from '../api/mockData'

const RANGE_KEY = {
  שבוע: 'week', week: 'week',
  חודש: 'month', month: 'month',
  שנה: 'year', year: 'year',
}

function mockForRange(range) {
  const key = RANGE_KEY[range] ?? 'year'
  return CHART_BY_RANGE[key]
}

export function useDashboardStats(range) {
  const mock = mockForRange(range)
  return useQuery({
    queryKey: ['dashboard', 'stats', range],
    queryFn: () => dashboardApi.stats()
      .then(r => r.data.data)
      .catch(() => mock.stats),
    placeholderData: mock.stats,
  })
}

export function useDashboardChart(range) {
  const mock = mockForRange(range)
  return useQuery({
    queryKey: ['dashboard', 'chart', range],
    queryFn: () => dashboardApi.chartData(range)
      .then(r => r.data.data)
      .catch(() => mock),
    placeholderData: mock,
  })
}
