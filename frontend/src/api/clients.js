import client from './client'

export const clientsApi = {
  list:        (params) => client.get('/clients', { params }),
  get:         (id)     => client.get(`/clients/${id}`),
  create:      (data)   => client.post('/clients', data),
  update:      (id, d)  => client.put(`/clients/${id}`, d),
  destroy:     (id)     => client.delete(`/clients/${id}`),
  convertLead: (leadId) => client.post('/clients/convert-lead', { lead_id: leadId }),
}
