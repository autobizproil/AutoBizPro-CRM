import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leadsApi } from '../api/leads'
import { MOCK_LEADS, MOCK_STAGES } from '../api/mockData'

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
      .then(r => r.data)
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
    mutationFn: (data) => leadsApi.create(data)
      .then(r => r.data.data)
      .catch(() => ({
        ...data,
        id: Date.now(),
        created_at: new Date().toISOString(),
        status: data.status || 'new',
        pipeline_stage_id: 1,
        stage: MOCK_STAGES[0],
        assigned_user: null,
        amount: 0,
        notes: '',
      })),
    onSuccess: (newLead) => {
      qc.setQueriesData({ queryKey: ['leads'] }, (old) => {
        if (!old) return old
        const existing = old?.data ?? (Array.isArray(old) ? old : [])
        return { data: [newLead, ...existing] }
      })
    },
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => leadsApi.update(id, data)
      .then(r => r.data.data)
      .catch(() => ({ id, ...data })),
    onSuccess: (updated) => {
      qc.setQueriesData({ queryKey: ['leads'] }, (old) => {
        if (!old) return old
        const existing = old?.data ?? []
        return { data: existing.map(l => l.id === updated.id ? { ...l, ...updated } : l) }
      })
    },
  })
}

export function useDeleteLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => leadsApi.remove(id).catch(() => ({ id })),
    onSuccess: (_, id) => {
      qc.setQueriesData({ queryKey: ['leads'] }, (old) => {
        if (!old) return old
        const existing = old?.data ?? []
        return { data: existing.filter(l => l.id !== id) }
      })
    },
  })
}

export function useChangeLeadStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, stageId }) => leadsApi.changeStage(leadId, stageId)
      .then(r => r.data.data)
      .catch(() => ({ leadId, stageId })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}
