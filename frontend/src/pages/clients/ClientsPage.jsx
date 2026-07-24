import { useState, useCallback } from 'react'

function CopyEmailIcon({ email }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" title={copied ? 'הועתק!' : email}
      onClick={() => navigator.clipboard.writeText(email).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
      className="w-7 h-7 flex items-center justify-center rounded-lg text-[#2398c2] hover:bg-[#2398c2]/10 transition-colors">
      {copied ? (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
        </svg>
      )}
    </button>
  )
}
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '../../api/clients'
import { useAuth } from '../../context/AuthContext'

const EMPTY = { name: '', phone: '', email: '', company: '', source: '', notes: '' }

const INPUT = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]'
const LABEL = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export default function ClientsPage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(EMPTY)
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['clients', search],
    queryFn:  () => clientsApi.list({ search }).then(r => r.data.data),
  })

  const clients = data?.data ?? []
  const total   = data?.total ?? 0

  const destroy = useMutation({
    mutationFn: (id) => clientsApi.destroy(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await clientsApi.create(form)
      qc.invalidateQueries({ queryKey: ['clients'] })
      setForm(EMPTY)
      setModal(false)
    } catch (err) {
      setError(err.response?.data?.message ?? 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">לקוחות</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{total} לקוחות פעילים</p>
        </div>
        {can('leads', 'can_create') && (
          <button onClick={() => { setForm(EMPTY); setError(''); setModal(true) }}
            className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm">
            <span className="text-lg leading-none">+</span> לקוח חדש
          </button>
        )}
      </div>

      <div className="mb-4">
        <input type="text" placeholder="🔍  חיפוש לפי שם, טלפון, אימייל, חברה..."
          value={search} onChange={e => setSearch(e.target.value)} className={INPUT} />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 text-right">
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">שם</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">טלפון</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">אימייל</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">חברה</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">מקור</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">נציג</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">תאריך</th>
              <th className="px-4 py-3 w-28 font-medium text-gray-500 dark:text-gray-400">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {isLoading && (
              <tr><td colSpan={8} className="py-8 text-center text-gray-400 dark:text-gray-500">טוען...</td></tr>
            )}
            {!isLoading && clients.length === 0 && (
              <tr><td colSpan={8} className="py-12 text-center text-gray-400 dark:text-gray-500">
                <div className="text-3xl mb-2">🏢</div>
                <div>אין לקוחות עדיין</div>
                {can('leads', 'can_create') && (
                  <button onClick={() => setModal(true)} className="mt-3 text-[#2398c2] hover:underline text-sm">+ הוסף ראשון</button>
                )}
              </td></tr>
            )}
            {clients.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#2398c2]/15 flex items-center justify-center text-[#2398c2] text-xs font-bold flex-shrink-0">
                      {c.name?.trim() ? c.name.trim()[0].toUpperCase() : '?'}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{c.name}</div>
                      {c.company && <div className="text-xs text-gray-400 dark:text-gray-500">{c.company}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300" dir="ltr">
                  {c.phone
                    ? <a href={`tel:${c.phone}`} className="hover:text-[#2398c2]">{c.phone}</a>
                    : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[160px] truncate">
                  {c.email
                    ? <a href={`mailto:${c.email}`} className="hover:text-[#2398c2] truncate block" dir="ltr">{c.email}</a>
                    : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                  {c.company || <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                  {c.source || <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-[#2398c2]">
                  {c.assigned_user?.name ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">
                  {new Date(c.created_at).toLocaleDateString('he-IL')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {c.phone && (
                      <a href={`https://wa.me/${c.phone.replace(/\D/g,'').replace(/^0/,'972')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30">
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </a>
                    )}
                    {c.email && <CopyEmailIcon email={c.email} />}
                    {can('leads', 'can_delete') && (
                      <button onClick={() => { if (confirm('למחוק לקוח זה?')) destroy.mutate(c.id) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 text-lg leading-none">×</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={() => setModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">לקוח חדש</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
              {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <div>
                <label className={LABEL}>שם <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={set('name')} placeholder="שם מלא" className={INPUT} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>טלפון</label><input value={form.phone} onChange={set('phone')} type="tel" className={INPUT} /></div>
                <div><label className={LABEL}>אימייל</label><input value={form.email} onChange={set('email')} type="email" className={INPUT} /></div>
              </div>
              <div>
                <label className={LABEL}>חברה</label>
                <input value={form.company} onChange={set('company')} placeholder="שם חברה" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>הערות</label>
                <textarea value={form.notes} onChange={set('notes')} rows={2} className={INPUT + ' resize-none'} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {saving ? 'שומר...' : 'הוסף לקוח'}
                </button>
                <button type="button" onClick={() => setModal(false)}
                  className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
