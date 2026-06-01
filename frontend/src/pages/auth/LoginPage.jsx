import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function LoginPage() {
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const { login }             = useAuth()
  const navigate              = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message ?? 'שגיאה בהתחברות')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 w-full max-w-sm">
        <div className="flex flex-col items-center gap-1 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[#2398c2] flex items-center justify-center text-white font-bold text-base">A</div>
            <span className="font-bold text-gray-900 text-xl">AutoBizPro</span>
          </div>
          <p className="text-sm text-gray-400 tracking-wide">מערכת CRM מתקדמת</p>
        </div>
        <h1 className="text-xl font-semibold text-gray-800 mb-6 text-center">כניסה למערכת</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2398c2] text-white rounded-lg h-11 text-sm font-semibold hover:bg-[#1d7fa3] disabled:opacity-50 transition-colors"
          >
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  )
}
