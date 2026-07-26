import client from './client'

export const savedViewsApi = {
  list:       (entityType, entityKey) => client.get('/saved-views', { params: { entity_type: entityType, entity_key: entityKey || undefined } }),
  create:     (data) => client.post('/saved-views', data),
  update:     (id, data) => client.put(`/saved-views/${id}`, data),
  remove:     (id) => client.delete(`/saved-views/${id}`),
  setDefault: (id) => client.post(`/saved-views/${id}/set-default`),
}
