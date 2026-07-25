import { useMutation, useQueryClient } from '@tanstack/react-query'
import { bulkDeleteApi } from '../api/bulkDelete'

export function useDeleteAllEntity(entity, queryKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => bulkDeleteApi.deleteAll(entity).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })
}
