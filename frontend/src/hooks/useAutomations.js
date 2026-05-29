import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { automationsApi } from '../api/automations'

export function useAutomations() {
  return useQuery({
    queryKey: ['automations'],
    queryFn:  () => automationsApi.list().then(r => r.data.data),
  })
}

export function useCreateAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => automationsApi.create(data).then(r => r.data.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })
}

export function useToggleAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => automationsApi.toggle(id).then(r => r.data.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })
}

export function useDeleteAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => automationsApi.remove(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })
}
