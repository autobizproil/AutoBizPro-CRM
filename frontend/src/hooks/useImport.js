import { useMutation, useQuery } from '@tanstack/react-query'
import { importApi } from '../api/import'

export function useUploadCsv() {
  return useMutation({ mutationFn: (file) => importApi.upload(file).then(r => r.data.data) })
}

export function useStartImport() {
  return useMutation({ mutationFn: (payload) => importApi.start(payload).then(r => r.data.data) })
}

export function useImportStatus(id, enabled) {
  return useQuery({
    queryKey: ['import', id],
    queryFn: () => importApi.status(id).then(r => r.data.data),
    enabled: !!id && enabled,
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return (s === 'done' || s === 'failed') ? false : 1500
    },
  })
}
