import client from './client'

export const settingsApi = {
  getLabels:    () => client.get('/settings/labels'),
  updateLabels: (labels) => client.put('/settings/labels', { labels }),
  getTenant:    () => client.get('/settings/tenant'),
  updateTenant: (data) => client.put('/settings/tenant', data),
}
