import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '../api/settings'

const LabelsContext = createContext({ t: (k) => k, labels: {} })

export function LabelsProvider({ children }) {
  const { data: labels = {} } = useQuery({
    queryKey: ['labels'],
    queryFn: () => settingsApi.getLabels().then(r => r.data.data),
    staleTime: 1000 * 60 * 10,
  })
  const t = (key) => labels[key] ?? key
  return <LabelsContext.Provider value={{ t, labels }}>{children}</LabelsContext.Provider>
}

export const useLabels = () => useContext(LabelsContext)
