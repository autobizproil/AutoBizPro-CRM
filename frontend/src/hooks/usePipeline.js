import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pipelineApi } from '../api/pipeline'
import { leadsApi } from '../api/leads'

export function usePipeline() {
  return useQuery({
    queryKey: ['pipeline'],
    queryFn:  () => pipelineApi.list().then(r => r.data.data),
  })
}

export function useChangeStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, stageId }) => leadsApi.changeStage(leadId, stageId),
    // Optimistic update for instant Kanban feedback
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
