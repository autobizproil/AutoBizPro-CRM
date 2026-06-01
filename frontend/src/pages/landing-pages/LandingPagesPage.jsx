import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { landingPagesApi } from '../../api/landingPages'

function StatusBadge({ status }) {
  const published = status === 'published'
  return (
    <span
      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
        published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {published ? 'פורסם' : 'טיוטה'}
    </span>
  )
}

export default function LandingPagesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['landing-pages'],
    queryFn: () => landingPagesApi.list().then((r) => r.data.data ?? r.data),
  })

  const pages = Array.isArray(data) ? data : []

  const destroy = useMutation({
    mutationFn: (id) => landingPagesApi.destroy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landing-pages'] }),
  })

  const handleDelete = (page) => {
    if (confirm(`למחוק את דף הנחיתה "${page.title}"?`)) {
      destroy.mutate(page.id)
    }
  }

  const handlePreview = (page) => {
    const tenant = window.location.hostname.split('.')[0]
    const tenantSlug = tenant === 'localhost' ? 'demo' : tenant
    window.open(`/lp/${tenantSlug}/${page.slug}`, '_blank')
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">דפי נחיתה</h2>
          <p className="text-sm text-gray-500 mt-0.5">צור ונהל דפי נחיתה לקמפיינים שלך</p>
        </div>
        <button
          onClick={() => navigate('/landing-pages/new')}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          דף נחיתה חדש
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-gray-500 text-sm">טוען...</div>
      ) : pages.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">🌐</div>
          <div className="text-base font-medium mb-1">אין דפי נחיתה עדיין</div>
          <p className="text-sm mb-4">צור דף נחיתה ראשון לקמפיין שלך</p>
          <button
            onClick={() => navigate('/landing-pages/new')}
            className="text-indigo-600 hover:underline text-sm"
          >
            צור דף נחיתה ראשון
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-right px-5 py-3 font-medium text-gray-600">כותרת</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">כתובת (slug)</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">סטטוס</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">צפיות</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">נוצר</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pages.map((page) => (
                <tr key={page.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{page.title}</td>
                  <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">{page.slug}</td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={page.status} />
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">{page.views_count ?? 0}</td>
                  <td className="px-5 py-3.5 text-gray-500">{formatDate(page.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => navigate(`/landing-pages/${page.id}/edit`)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                      >
                        עריכה
                      </button>
                      <button
                        onClick={() => handlePreview(page)}
                        className="text-gray-500 hover:text-gray-700 font-medium text-xs"
                      >
                        תצוגה מקדימה
                      </button>
                      <button
                        onClick={() => handleDelete(page)}
                        disabled={destroy.isPending}
                        className="text-red-400 hover:text-red-600 font-medium text-xs disabled:opacity-40"
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
