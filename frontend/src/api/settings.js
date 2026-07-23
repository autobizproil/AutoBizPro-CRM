import client from './client'

export const settingsApi = {
  getLabels:    () => client.get('/settings/labels'),
  updateLabels: (labels) => client.put('/settings/labels', { labels }),
  getTenant:    () => client.get('/settings/tenant'),
  updateTenant: (data) => client.put('/settings/tenant', data),
  uploadLogo:   (file) => {
    const fd = new FormData()
    fd.append('logo', file)
    return client.post('/settings/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  deleteLogo:   () => client.delete('/settings/logo'),
  getPermissions:    () => client.get('/settings/permissions'),
  updatePermissions: (permissions) => client.put('/settings/permissions', { permissions }),
}
