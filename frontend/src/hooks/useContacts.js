import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '../api/contacts'
import { MOCK_CONTACTS } from '../api/mockData'

function filterMockContacts(filters) {
  let results = [...MOCK_CONTACTS]
  if (filters.search) {
    const q = filters.search.toLowerCase()
    results = results.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q)
    )
  }
  return results
}

const MOCK_SHAPE = (filters) => ({ data: filterMockContacts(filters) })

export function useContacts(filters = {}) {
  return useQuery({
    queryKey: ['contacts', filters],
    queryFn: () => contactsApi.list(filters)
      .then(r => r.data)
      .catch(() => MOCK_SHAPE(filters)),
    placeholderData: MOCK_SHAPE(filters),
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => contactsApi.create(data)
      .then(r => r.data.data)
      .catch(() => ({
        ...data,
        id: Date.now(),
        type: 'ליד',
        favorite: false,
        last_contact: 'עכשיו',
      })),
    onSuccess: (newContact) => {
      qc.setQueriesData({ queryKey: ['contacts'] }, (old) => {
        if (!old) return old
        const existing = old?.data ?? []
        return { data: [newContact, ...existing] }
      })
    },
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => contactsApi.update(id, data)
      .then(r => r.data.data)
      .catch(() => ({ id, ...data })),
    onSuccess: (updated) => {
      qc.setQueriesData({ queryKey: ['contacts'] }, (old) => {
        if (!old) return old
        const existing = old?.data ?? []
        return { data: existing.map(c => c.id === updated.id ? { ...c, ...updated } : c) }
      })
    },
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => contactsApi.remove(id).catch(() => ({ id })),
    onSuccess: (_, id) => {
      qc.setQueriesData({ queryKey: ['contacts'] }, (old) => {
        if (!old) return old
        const existing = old?.data ?? []
        return { data: existing.filter(c => c.id !== id) }
      })
    },
  })
}
