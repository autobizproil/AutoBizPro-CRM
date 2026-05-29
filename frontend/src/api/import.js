import client from './client'

export const importApi = {
  upload: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return client.post('/import/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  start:  (payload) => client.post('/import/start', payload),
  status: (id) => client.get(`/import/${id}`),
}
