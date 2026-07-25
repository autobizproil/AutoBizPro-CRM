import client from './client'

export const bulkDeleteApi = {
  deleteAll: (entity) => client.delete(`/entities/${entity}/all`),
}
