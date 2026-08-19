import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { authApi } from '../../api/auth'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const token = searchParams.get('token') ?? ''

  const [password, setPassword]               = useState('')
  const [passwordConfirm, setPasswordConfirm]  = useState('')
  const [error, setError]                      = useState('')
  const [loading, setLoading]                  = useState(false)
  const navigate                               = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.resetPassword({ email, token, password, password_confirmation: passwordConfirm })
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message ?? 'שגיאה באיפוס הסיסמה')
    } finally {
      setLoading(false)
    }
  }

  if (!email || !token) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center" dir="rtl">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm text-center space-y-4">
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
            קישור איפוס לא תקין
          </div>
          <Link to="/forgot-password" className="text-sm text-[#2398c2] hover:underline">בקשת קישור חדש</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center" dir="rtl">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-6 text-center">איפוס סיסמה</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סיסמה חדשה</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">אימות סיסמה</label>
            <input
              type="password"
              value={passwordConfirm}
              onChange={e => setPasswordConfirm(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              minLength={8}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2398c2] text-white rounded-lg h-11 text-sm font-semibold hover:bg-[#1d7fa3] disabled:opacity-50 transition-colors"
          >
            {loading ? 'מאפס...' : 'איפוס סיסמה'}
          </button>
        </form>
      </div>
    </div>
  )
}
