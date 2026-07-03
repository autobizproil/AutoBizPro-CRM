import { createContext, useContext, useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const queryClient                   = useQueryClient()
  const [user, setUser]               = useState(null)
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    authApi.me()
      .then(({ data }) => {
        setUser(data.data.user)
        setPermissions(data.data.permissions)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const { data } = await authApi.login(email, password)
    setUser(data.data.user)
    setPermissions(data.data.permissions)
    return data.data.user
  }

  const logout = async () => {
    await authApi.logout()
    setUser(null)
    setPermissions({})
    queryClient.clear()
    window.localStorage.removeItem('abp-query-cache')
    window.location.href = '/login'
  }

  const can = (module, action) => permissions?.[module]?.[action] ?? false

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
