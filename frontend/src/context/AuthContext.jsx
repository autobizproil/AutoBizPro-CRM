import { createContext, useContext, useState, useEffect } from 'react'
import { authApi } from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null)
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    authApi.me()
      .then(({ data }) => {
        setUser(data.data.user)
        setPermissions(data.data.permissions)
      })
      .catch(() => {
        // Dev fallback — remove in production
        setUser({ name: 'דנה כהן', role: 'מנהלת מכירות', email: 'dana@autobizpro.co.il' })
        setPermissions({
          leads:       { can_create: true, can_update: true, can_delete: true },
          contacts:    { can_create: true, can_update: true, can_delete: true },
          automations: { can_create: true, can_update: true, can_delete: true },
          forms:       { can_create: true, can_update: true, can_delete: true },
          users:       { can_update: true },
        })
      })
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
