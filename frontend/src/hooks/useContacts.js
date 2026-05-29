import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '../api/contacts'

export function useContacts(filters = {}) {
  return useQuery({
    queryKey: ['contacts', filters],
    queryFn:  () => contactsApi.list(filters).then(r => r.data.data),
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => contactsApi.create(data).then(r => r.data.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => contactsApi.update(id, data).then(r => r.data.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => contactsApi.remove(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}
