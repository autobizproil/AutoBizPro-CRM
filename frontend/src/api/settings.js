import client from './client'

export const settingsApi = {
  getTenant:        ()          => client.get('/settings/tenant'),
  putTenant:        (data)      => client.put('/settings/tenant', data),
  uploadLogo:       (file)      => {
    const fd = new FormData()
    fd.append('logo', file)
    return client.post('/settings/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  getStages:        ()          => client.get('/settings/stages'),
  putStages:        (data)      => client.put('/settings/stages', data),
  getUsers:         ()          => client.get('/users'),
  createUser:       (data)      => client.post('/users', data),
  updateUser:       (id, data)  => client.put(`/users/${id}`, data),
  getIntegrations:  ()          => client.get('/settings/integrations'),
  putIntegrations:  (data)      => client.put('/settings/integrations', data),
  testWebhook:      ()          => client.post('/settings/webhook/test'),
  rotateApiKey:     ()          => client.post('/settings/api-key/rotate'),
  putNotifications: (data)      => client.put('/settings/notifications', data),
  changePassword:   (data)      => client.post('/auth/password', data),
}
