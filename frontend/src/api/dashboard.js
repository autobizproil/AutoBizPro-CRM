import client from './client'

export const dashboardApi = {
  stats:     () => client.get('/dashboard/stats'),
  chartData: (range = 'year') => client.get('/dashboard/chart-data', { params: { range } }),
}
