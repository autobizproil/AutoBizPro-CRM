import client from './client'

export const landingPagesApi = {
  list:    ()           => client.get('/landing-pages'),
  get:     (id)         => client.get(`/landing-pages/${id}`),
  create:  (data)       => client.post('/landing-pages', data),
  update:  (id, data)   => client.put(`/landing-pages/${id}`, data),
  destroy: (id)         => client.delete(`/landing-pages/${id}`),
}
