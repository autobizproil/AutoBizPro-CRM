import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pipelineApi } from '../api/pipeline'
import { leadsApi } from '../api/leads'
import { MOCK_STAGES, MOCK_LEADS } from '../api/mockData'

function getMockPipeline() {
  return MOCK_STAGES.map(stage => ({
    ...stage,
    leads: MOCK_LEADS.filter(l => l.pipeline_stage_id === stage.id).map(l => ({
      id: l.id, name: l.name, phone: l.phone, amount: l.amount,
      assigned_user: l.assigned_user,
    })),
    sum: MOCK_LEADS.filter(l => l.pipeline_stage_id === stage.id).reduce((s, l) => s + (l.amount || 0), 0),
  }))
}

export function usePipeline() {
  return useQuery({
    queryKey: ['pipeline'],
    queryFn: () => pipelineApi.list().then(r => r.data.data).catch(() => getMockPipeline()),
    placeholderData: getMockPipeline(),
  })
}

export function useChangeStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, stageId }) => leadsApi.changeStage(leadId, stageId),
    onMutate: async ({ leadId, stageId }) => {
      await qc.cancelQueries({ queryKey: ['pipeline'] })
      const prev = qc.getQueryData(['pipeline'])
      qc.setQueryData(['pipeline'], (old) => {
        if (!old) return old
        return old.map(stage => ({
          ...stage,
          leads: stage.id === stageId
            ? [...(stage.leads || []), { id: leadId }]
            : (stage.leads || []).filter(l => l.id !== leadId),
        }))
      })
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['pipeline'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['pipeline'] }),
  })
}
