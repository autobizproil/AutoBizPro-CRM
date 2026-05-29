import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import client from '../../api/client'
import { pipelineApi } from '../../api/pipeline'
import { useAuth } from '../../context/AuthContext'

const FIELD_TYPES = [
  { value: 'text',     label: 'טקסט' },
  { value: 'email',    label: 'אימייל' },
  { value: 'phone',    label: 'טלפון' },
  { value: 'textarea', label: 'טקסט ארוך' },
  { value: 'select',   label: 'בחירה' },
  { value: 'checkbox', label: 'תיבת סימון' },
]

const EMPTY_FIELD = { label: '', type: 'text', required: true }

export default function FormsPage() {
  const { can } = useAuth()
  const qc      = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [name, setName]   = useState('')
  const [stage, setStage] = useState('')
  const [fields, setFields] = useState([{ ...EMPTY_FIELD }])
  const [error, setError] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['forms'],
    queryFn:  () => client.get('/forms').then(r => r.data.data),
  })
  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: () => pipelineApi.stages().then(r => r.data.data),
  })

  const create = useMutation({
    mutationFn: (payload) => client.post('/forms', payload).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['forms'] }); closeModal() },
    onError: (e) => setError(e.response?.data?.message ?? 'שגיאה ביצירת הטופס'),
  })
  const remove = useMutation({
    mutationFn: (id) => client.delete(`/forms/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['forms'] }),
  })

  const forms = Array.isArray(data) ? data : (data?.data ?? [])

  const closeModal = () => { setShowModal(false); setName(''); setStage(''); setFields([{ ...EMPTY_FIELD }]); setError('') }
  const setField = (i, key) => (e) => setFields(fs => fs.map((f, idx) => idx === i ? { ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } : f))
  const addField = () => setFields(fs => [...fs, { ...EMPTY_FIELD }])
  const removeField = (i) => setFields(fs => fs.filter((_, idx) => idx !== i))

  const submit = (e) => {
    e.preventDefault()
    setError('')
    const validFields = fields.filter(f => f.label.trim())
    if (!name.trim()) return setError('שם הטופס חובה')
    if (!validFields.length) return setError('חובה שדה אחד לפחות')
    create.mutate({
      name,
      fields: validFields,
      destination_pipeline_id: stage || undefined,
      active: true,
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">טפסים</h2>
          <p className="text-sm text-gray-500 mt-0.5">טפסים ציבוריים שיוצרים לידים אוטומטית</p>
        </div>
        {can('forms', 'can_create') && (
          <button onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm">
            <span className="text-lg leading-none">+</span> טופס חדש
          </button>
        )}
      </div>

      {isLoading ? <div className="text-gray-500 text-sm">טוען...</div> : (
        <div className="space-y-3">
          {forms.map(form => (
            <div key={form.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900">{form.name}</div>
                  <div className="text-sm text-gray-500 mt-0.5 truncate">
                    {window.location.origin}/f/{form.slug}
                    <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/f/${form.slug}`)}
                      className="mr-2 text-indigo-500 hover:text-indigo-700 text-xs">העתק קישור</button>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${form.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {form.active ? 'פעיל' : 'לא פעיל'}
                  </span>
                  {can('forms', 'can_delete') && (
                    <button onClick={() => { if (confirm('למחוק את הטופס?')) remove.mutate(form.id) }}
                      className="text-red-400 hover:text-red-600 text-xs">מחק</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {forms.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">📝</div>
              <div className="text-sm">אין טפסים עדיין</div>
              {can('forms', 'can_create') && (
                <button onClick={() => setShowModal(true)} className="mt-3 text-indigo-600 hover:underline text-sm">צור טופס ראשון</button>
              )}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">טופס חדש</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={submit} className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם הטופס <span className="text-red-500">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="לדוגמה: טופס יצירת קשר"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שלב יעד ללידים</label>
                <select value={stage} onChange={e => setStage(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">שלב ברירת מחדל</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">שדות הטופס</label>
                <div className="space-y-2">
                  {fields.map((f, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={f.label} onChange={setField(i, 'label')} placeholder="תווית השדה"
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                      <select value={f.type} onChange={setField(i, 'type')}
                        className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                        <input type="checkbox" checked={f.required} onChange={setField(i, 'required')} className="rounded border-gray-300" />
                        חובה
                      </label>
                      {fields.length > 1 && (
                        <button type="button" onClick={() => removeField(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addField} className="mt-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium">+ הוסף שדה</button>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={create.isPending}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {create.isPending ? 'שומר...' : 'צור טופס'}
                </button>
                <button type="button" onClick={closeModal} className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
