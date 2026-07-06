import client from './client'

export const recordTypesApi = {
  list:    ()               => client.get('/record-types'),
  create:  (data)            => client.post('/record-types', data),
  update:  (id, data)        => client.put(`/record-types/${id}`, data),
  destroy: (id)               => client.delete(`/record-types/${id}`),
}

export const recordsApi = {
  list:    (typeId, params)  => client.get(`/record-types/${typeId}/records`, { params }),
  create:  (typeId, data)    => client.post(`/record-types/${typeId}/records`, { data }),
  show:    (typeId, id)      => client.get(`/record-types/${typeId}/records/${id}`),
  update:  (typeId, id, data) => client.put(`/record-types/${typeId}/records/${id}`, { data }),
  destroy: (typeId, id)      => client.delete(`/record-types/${typeId}/records/${id}`),
}

// Emoji options offered when creating a record type
export const RECORD_TYPE_ICONS = ['📄', '🧾', '💰', '📦', '🚗', '🏠', '📋', '📑', '🗂️', '⭐', '🔧', '📁']
