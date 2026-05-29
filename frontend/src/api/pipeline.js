import client from './client'

export const pipelineApi = {
  stages:  ()         => client.get('/pipeline'),
  create:  (data)     => client.post('/pipeline', data),
  update:  (id, data) => client.put(`/pipeline/${id}`, data),
  remove:  (id)       => client.delete(`/pipeline/${id}`),
  reorder: (stages)   => client.put('/pipeline/reorder', { stages }),
}
