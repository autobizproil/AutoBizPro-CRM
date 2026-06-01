import { useState } from 'react'
import { useContacts, useCreateContact, useDeleteContact } from '../../hooks/useContacts'
import { useAuth } from '../../context/AuthContext'

export default function ContactsPage() {
  const { can }             = useAuth()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useContacts({ search })
  const createContact       = useCreateContact()
  const deleteContact       = useDeleteContact()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]     = useState({ name: '', phone: '', email: '', company: '' })

  const contacts = data?.data ?? []

  const handleCreate = async (e) => {
    e.preventDefault()
    await createContact.mutateAsync(form)
    setForm({ name: '', phone: '', email: '', company: '' })
    setShowForm(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">אנשי קשר</h2>
        {can('contacts', 'can_create') && (
          <button onClick={() => setShowForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            + איש קשר חדש
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="חיפוש..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-4 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-gray-800">איש קשר חדש</h3>
          {[['name','שם *'],['phone','טלפון'],['email','אימייל'],['company','חברה']].map(([k, label]) => (
            <input key={k} placeholder={label} value={form[k]}
              onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              required={k === 'name'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          ))}
          <div className="flex gap-2">
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">שמור</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 text-sm px-3 py-2">ביטול</button>
          </div>
        </form>
      )}

      {isLoading ? <div className="text-gray-500 text-sm">טוען...</div> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['שם','טלפון','אימייל','חברה',''].map(h => (
                  <th key={h} className="text-right px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.company ?? '—'}</td>
                  <td className="px-4 py-3">
                    {can('contacts', 'can_delete') && (
                      <button onClick={() => deleteContact.mutate(c.id)} className="text-red-400 hover:text-red-600 text-xs">מחק</button>
                    )}
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
