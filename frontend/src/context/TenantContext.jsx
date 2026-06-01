import { createContext, useContext } from 'react'

const TenantContext = createContext(null)

export function TenantProvider({ tenant, children }) {
  return (
    <TenantContext.Provider value={tenant}>
      {children}
    </TenantContext.Provider>
  )
}

export const useTenant = () => useContext(TenantContext)
