import client from './client'

export const usersApi = {
  list:       ()         => client.get('/users'),
  create:     (data)     => client.post('/users', data),
  update:     (id, data) => client.put(`/users/${id}`, data),
  deactivate: (id)       => client.delete(`/users/${id}`),
}
