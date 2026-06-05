import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leadsApi } from '../api/leads'
import { MOCK_LEADS } from '../api/mockData'

function filterMockLeads(filters) {
  let results = [...MOCK_LEADS]
  if (filters.search) {
    const q = filters.search.toLowerCase()
    results = results.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.email?.toLowerCase().includes(q)
    )
  }
  if (filters.status) results = results.filter(l => l.status === filters.status)
  if (filters.assigned_to === 'null') results = results.filter(l => !l.assigned_user)
  return results
}

const MOCK_SHAPE = (filters) => ({ data: filterMockLeads(filters) })

export function useLeads(filters = {}) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => leadsApi.list(filters)
      .then(r => r.data.data)
      .catch(() => MOCK_SHAPE(filters)),
    placeholderData: MOCK_SHAPE(filters),
  })
}

export function useLead(id) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: () => leadsApi.get(id)
      .then(r => r.data.data)
      .catch(() => MOCK_LEADS.find(l => l.id === id) || null),
    enabled: !!id,
  })
}

export function useCreateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => leadsApi.create(data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => leadsApi.update(id, data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useDeleteLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => leadsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useChangeLeadStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, stageId }) => leadsApi.changeStage(leadId, stageId).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}
