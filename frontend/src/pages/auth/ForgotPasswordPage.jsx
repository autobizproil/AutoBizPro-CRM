import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../../api/auth'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.message ?? 'שגיאה בשליחת הבקשה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center" dir="rtl">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-6 text-center">שכחתי סיסמה</h1>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-green-700 dark:text-green-300 text-sm">
              אם קיים חשבון עם כתובת אימייל זו, נשלח אליו קישור לאיפוס סיסמה
            </div>
            <Link to="/login" className="text-sm text-[#2398c2] hover:underline">חזרה להתחברות</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2398c2] text-white rounded-lg h-11 text-sm font-semibold hover:bg-[#1d7fa3] disabled:opacity-50 transition-colors"
            >
              {loading ? 'שולח...' : 'שלח קישור לאיפוס'}
            </button>
            <Link to="/login" className="block text-center text-sm text-gray-500 dark:text-gray-400 hover:underline">חזרה להתחברות</Link>
          </form>
        )}
      </div>
    </div>
  )
}
