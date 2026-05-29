import client from './client'

export const leadsApi = {
  list:          (params) => client.get('/leads', { params }),
  get:           (id)     => client.get(`/leads/${id}`),
  create:        (data)   => client.post('/leads', data),
  update:        (id, data) => client.put(`/leads/${id}`, data),
  remove:        (id)     => client.delete(`/leads/${id}`),
  changeStage:   (id, stageId) => client.put(`/leads/${id}/stage`, { stage_id: stageId }),
  getActivities: (id)     => client.get(`/leads/${id}/activities`),
  addActivity:   (id, data) => client.post(`/leads/${id}/activities`, data),
}
