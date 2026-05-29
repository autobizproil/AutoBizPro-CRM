import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { whatsappApi } from '../api/whatsapp'

export function useWhatsappTemplates() {
  return useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: () => whatsappApi.list().then(r => r.data.data),
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => whatsappApi.create(data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-templates'] }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => whatsappApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-templates'] }),
  })
}
