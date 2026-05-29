import client from './client'

export const dashboardApi = {
  stats:     () => client.get('/dashboard/stats'),
  chartData: () => client.get('/dashboard/chart-data'),
}
