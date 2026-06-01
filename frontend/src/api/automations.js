import client from './client'

export const automationsApi = {
  list:   ()         => client.get('/automations'),
  get:    (id)       => client.get(`/automations/${id}`),
  create: (data)     => client.post('/automations', data),
  update: (id, data) => client.put(`/automations/${id}`, data),
  remove: (id)       => client.delete(`/automations/${id}`),
  toggle: (id)       => client.post(`/automations/${id}/toggle`),
}
