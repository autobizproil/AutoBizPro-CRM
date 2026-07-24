import { useState } from 'react'
import { useContacts, useCreateContact, useDeleteContact } from '../../hooks/useContacts'
import { useAuth } from '../../context/AuthContext'

function CopyEmailBtn({ email, className = '' }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" title={copied ? 'הועתק!' : email}
      onClick={() => navigator.clipboard.writeText(email).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
      className={`hover:text-[#2398c2] transition-colors ${className}`}>
      {copied ? '✓' : email}
    </button>
  )
}

const EMPTY = { name: '', phone: '', email: '', company: '', role: '', notes: '' }

const INPUT = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]'
const LABEL = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export default function ContactsPage() {
  const { can }             = useAuth()
  const { lang }            = usePreferences()
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(EMPTY)
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useContacts({ search })
  const createContact       = useCreateContact()
  const deleteContact       = useDeleteContact()

  const contacts = data?.data ?? []
  const total    = data?.total ?? 0

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const tr = (key) => translations[lang]?.[key] ?? key

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await createContact.mutateAsync(form)
      setForm(EMPTY)
      setModal(false)
    } catch (err) {
      setError(err.response?.data?.message ?? 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{tr('contacts')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{total} {tr('contacts')}</p>
        </div>
        {can('contacts', 'can_create') && (
          <button onClick={() => setModal(true)}
            className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
            <span className="text-lg leading-none">+</span> איש קשר חדש
          </button>
        )}
      </div>

      <div className="mb-4">
        <input type="text" placeholder="🔍  חיפוש לפי שם, טלפון, אימייל..."
          value={search} onChange={e => setSearch(e.target.value)}
          className={INPUT} />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 text-right">
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">שם</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">טלפון</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">אימייל</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">חברה</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">תפקיד</th>
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">תאריך</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {isLoading && (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400 dark:text-gray-500">טוען...</td></tr>
            )}
            {!isLoading && contacts.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-gray-400 dark:text-gray-500">
                <div className="text-3xl mb-2">📋</div>
                <div>אין אנשי קשר עדיין</div>
                {can('contacts', 'can_create') && (
                  <button onClick={() => setModal(true)} className="mt-3 text-[#2398c2] hover:underline text-sm">+ הוסף ראשון</button>
                )}
              </td></tr>
            )}
            {contacts.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-700 dark:text-purple-300 text-xs font-bold flex-shrink-0">
                      {c.name?.trim() ? c.name.trim()[0].toUpperCase() : '?'}
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400" dir="ltr">
                  {c.phone
                    ? <a href={`tel:${c.phone}`} className="hover:text-[#2398c2]">{c.phone}</a>
                    : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400" dir="ltr">
                  {c.email
                    ? <CopyEmailBtn email={c.email} />
                    : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.company || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{c.role || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">{new Date(c.created_at).toLocaleDateString('he-IL')}</td>
                <td className="px-4 py-3">
                  {can('contacts', 'can_delete') && (
                    <button onClick={() => { if (confirm('למחוק?')) deleteContact.mutate(c.id) }}
                      className="text-gray-300 dark:text-gray-600 hover:text-red-500 text-lg leading-none">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">איש קשר חדש</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
              {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>}

              <div>
                <label className={LABEL}>שם <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={set('name')} placeholder="שם מלא" className={INPUT} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>טלפון</label>
                  <input value={form.phone} onChange={set('phone')} type="tel" placeholder="05X-XXXXXXX" className={INPUT} dir="ltr" />
                </div>
                <div>
                  <label className={LABEL}>אימייל</label>
                  <input value={form.email} onChange={set('email')} type="email" placeholder="email@..." className={INPUT} dir="ltr" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>חברה</label>
                  <input value={form.company} onChange={set('company')} placeholder="שם חברה" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>תפקיד</label>
                  <input value={form.role} onChange={set('role')} placeholder="תפקיד" className={INPUT} />
                </div>
              </div>

              <div>
                <label className={LABEL}>הערות</label>
                <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="הערות..."
                  className={INPUT + ' resize-none'} />
              </div>

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'שומר...' : 'הוסף איש קשר'}
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
