import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { savedViewsApi } from '../api/savedViews'

export function useSavedViews(entityType, entityKey, onApplyDefault) {
  const qc = useQueryClient()
  const queryKey = ['saved-views', entityType, entityKey ?? null]
  const appliedDefault = useRef(false)

  const query = useQuery({
    queryKey,
    queryFn: () => savedViewsApi.list(entityType, entityKey).then(r => r.data.data),
  })

  useEffect(() => {
    if (appliedDefault.current || !query.data) return
    appliedDefault.current = true
    const def = query.data.find(v => v.is_default)
    if (def) onApplyDefault(def)
  }, [query.data, onApplyDefault])

  const create = useMutation({
    mutationFn: (data) => savedViewsApi.create({ entity_type: entityType, entity_key: entityKey, ...data }).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const update = useMutation({
    mutationFn: ({ id, data }) => savedViewsApi.update(id, { entity_type: entityType, entity_key: entityKey, ...data }).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const remove = useMutation({
    mutationFn: (id) => savedViewsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const setDefault = useMutation({
    mutationFn: (id) => savedViewsApi.setDefault(id).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  return { views: query.data ?? [], isLoading: query.isLoading, create, update, remove, setDefault }
}
