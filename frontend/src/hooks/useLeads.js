import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leadsApi } from '../api/leads'

export function useLeads(filters = {}) {
  return useQuery({
    queryKey: ['leads', filters],
    // API envelope is { success, data: <paginator> }; return the paginator
    // so the component reads data.data (array) and data.total.
    queryFn: () => leadsApi.list(filters).then(r => r.data.data),
    keepPreviousData: true,
  })
}

export function useLead(id) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.get(id).then(r => r.data.data),
    enabled: !!id,
  })
}

export function useLeadActivities(id) {
  return useQuery({
    queryKey: ['lead-activities', id],
    queryFn: () => leadsApi.getActivities(id).then(r => r.data.data),
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
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', vars.id] })
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export function useAddLeadActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, data }) => leadsApi.addActivity(leadId, data).then(r => r.data.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['lead-activities', vars.leadId] })
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export function useBulkLeadAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ action, ids, value }) => leadsApi.bulk(action, ids, value).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}
