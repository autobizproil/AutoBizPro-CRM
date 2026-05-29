import { useState } from 'react'
import { useContacts, useCreateContact, useDeleteContact } from '../../hooks/useContacts'
import { useAuth } from '../../context/AuthContext'

const EMPTY = { name: '', phone: '', email: '', company: '', role: '', notes: '' }

export default function ContactsPage() {
  const { can }             = useAuth()
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
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">אנשי קשר</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} אנשי קשר</p>
        </div>
        {can('contacts', 'can_create') && (
          <button onClick={() => setModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
            <span className="text-lg leading-none">+</span> איש קשר חדש
          </button>
        )}
      </div>

      <div className="mb-4">
        <input type="text" placeholder="🔍  חיפוש לפי שם, טלפון, אימייל..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-right">
              <th className="px-4 py-3 font-medium text-gray-500">שם</th>
              <th className="px-4 py-3 font-medium text-gray-500">טלפון</th>
              <th className="px-4 py-3 font-medium text-gray-500">אימייל</th>
              <th className="px-4 py-3 font-medium text-gray-500">חברה</th>
              <th className="px-4 py-3 font-medium text-gray-500">תפקיד</th>
              <th className="px-4 py-3 font-medium text-gray-500">תאריך</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">טוען...</td></tr>
            )}
            {!isLoading && contacts.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-gray-400">
                <div className="text-3xl mb-2">📋</div>
                <div>אין אנשי קשר עדיין</div>
                {can('contacts','can_create') && (
                  <button onClick={() => setModal(true)} className="mt-3 text-indigo-600 hover:underline text-sm">+ הוסף ראשון</button>
                )}
              </td></tr>
            )}
            {contacts.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold flex-shrink-0">
                      {c.name[0]}
                    </div>
                    <span className="font-medium text-gray-900">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {c.phone ? <a href={`tel:${c.phone}`} className="hover:text-indigo-600">{c.phone}</a> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {c.email ? <a href={`mailto:${c.email}`} className="hover:text-indigo-600">{c.email}</a> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{c.company || <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{c.role || <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(c.created_at).toLocaleDateString('he-IL')}</td>
                <td className="px-4 py-3">
                  {can('contacts','can_delete') && (
                    <button onClick={() => { if (confirm('למחוק?')) deleteContact.mutate(c.id) }}
                      className="text-gray-300 hover:text-red-500 text-lg leading-none">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">איש קשר חדש</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={set('name')} placeholder="שם מלא"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                  <input value={form.phone} onChange={set('phone')} type="tel" placeholder="05X-XXXXXXX"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                  <input value={form.email} onChange={set('email')} type="email" placeholder="email@..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">חברה</label>
                  <input value={form.company} onChange={set('company')} placeholder="שם חברה"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד</label>
                  <input value={form.role} onChange={set('role')} placeholder="תפקיד"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
                <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="הערות..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </div>

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'שומר...' : 'הוסף איש קשר'}
                </button>
                <button type="button" onClick={() => setModal(false)}
                  className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
