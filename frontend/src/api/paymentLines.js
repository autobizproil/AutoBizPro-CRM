import client from './client'

export const paymentLinesApi = {
  list:    (typeId, recordId)        => client.get(`/record-types/${typeId}/records/${recordId}/payment-lines`),
  create:  (typeId, recordId, data)  => client.post(`/record-types/${typeId}/records/${recordId}/payment-lines`, data),
  update:  (typeId, recordId, id, data) => client.put(`/record-types/${typeId}/records/${recordId}/payment-lines/${id}`, data),
  destroy: (typeId, recordId, id)    => client.delete(`/record-types/${typeId}/records/${recordId}/payment-lines/${id}`),
}
