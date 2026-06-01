import client from './client'

export const contactsApi = {
  list:   (params)   => client.get('/contacts', { params }),
  get:    (id)       => client.get(`/contacts/${id}`),
  create: (data)     => client.post('/contacts', data),
  update: (id, data) => client.put(`/contacts/${id}`, data),
  remove: (id)       => client.delete(`/contacts/${id}`),
}
