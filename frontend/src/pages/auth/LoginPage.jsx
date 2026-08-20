import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const FEATURES = [
  { icon: '🎯', text: 'ניהול לידים ופייפליין חכם' },
  { icon: '⚡', text: 'אוטומציות שחוסכות שעות עבודה' },
  { icon: '📊', text: 'לוחות בקרה ודוחות בזמן אמת' },
  { icon: '🧾', text: 'חשבוניות, תשלומים וחתימות דיגיטליות' },
]

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { login }               = useAuth()
  const navigate                = useNavigate()

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
    <div className="min-h-screen flex" dir="rtl">
      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-1 mb-8">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-xl bg-[#2398c2] flex items-center justify-center text-white font-bold text-base">A</div>
              <span className="font-bold text-gray-900 dark:text-gray-100 text-xl">AutoBizPro</span>
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500 tracking-wide">מערכת CRM מתקדמת</p>
          </div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-6 text-center">כניסה למערכת</h1>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]"
                required
              />
              <div className="text-left mt-1">
                <Link to="/forgot-password" className="text-xs text-[#2398c2] hover:underline">שכחתי סיסמה</Link>
              </div>
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

      {/* Marketing panel — desktop only */}
      <div className="hidden lg:flex flex-1 relative items-center justify-center overflow-hidden text-white p-16"
        style={{ background: 'linear-gradient(135deg, #1d7fa3 0%, #2398c2 55%, #6fb84f 100%)' }}>
        {/* Decorative blobs */}
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 w-96 h-96 rounded-full bg-[#b1e239]/20 blur-3xl" />

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight mb-4">
            כל מה שהעסק שלך צריך.<br />
            <span className="text-[#d7f28e]">במקום אחד.</span>
          </h2>
          <p className="text-white/80 text-sm leading-relaxed mb-8">
            AutoBizPro מרכזת לידים, לקוחות, משימות, אוטומציות וחשבוניות בממשק אחד —
            כדי שתתמקד בסגירת עסקאות, לא בניהול טבלאות.
          </p>

          <ul className="space-y-3 mb-10">
            {FEATURES.map(f => (
              <li key={f.text} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3">
                <span className="text-xl leading-none">{f.icon}</span>
                <span className="text-sm font-medium">{f.text}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3 text-white/60 text-xs">
            <div className="flex -space-x-2 space-x-reverse">
              {['🟦', '🟩', '🟧'].map((e, i) => (
                <div key={i} className="w-7 h-7 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-xs">{e}</div>
              ))}
            </div>
            <span>מאות עסקים כבר מנהלים את הלקוחות שלהם עם AutoBizPro</span>
          </div>
        </div>
      </div>
    </div>
  )
}
