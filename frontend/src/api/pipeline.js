import client from './client'

export const pipelineApi = {
  list:    ()         => client.get('/pipelines'),
  create:  (data)     => client.post('/pipelines', data),
  update:  (id, data) => client.put(`/pipelines/${id}`, data),
  remove:  (id)       => client.delete(`/pipelines/${id}`),
  reorder: (stages)   => client.put('/pipelines/reorder', { stages }),
}
