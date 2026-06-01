import client from './client'

export const dashboardApi = {
  stats:              () => client.get('/dashboard/stats'),
  chartData:          (params) => client.get('/dashboard/chart-data', { params }),
  reportsBySource:    (params) => client.get('/dashboard/reports/leads-by-source', { params }),
  reportsByAgent:     (params) => client.get('/dashboard/reports/leads-by-agent',  { params }),
  reportsActivities:  (params) => client.get('/dashboard/reports/activities',       { params }),
  reportsConversion:  (params) => client.get('/dashboard/reports/conversion',       { params }),
  exportLeads:        (params) => client.get('/dashboard/reports/export',           { params, responseType: 'blob' }),
}
