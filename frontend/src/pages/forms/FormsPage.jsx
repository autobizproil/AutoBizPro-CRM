import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import client from '../../api/client'
import { pipelineApi } from '../../api/pipeline'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

const FIELD_TYPES = [
  { value: 'text',     label: 'טקסט' },
  { value: 'email',    label: 'אימייל' },
  { value: 'phone',    label: 'טלפון' },
  { value: 'textarea', label: 'טקסט ארוך' },
  { value: 'select',   label: 'בחירה' },
  { value: 'checkbox', label: 'תיבת סימון' },
]

const EMPTY_FIELD = { label: '', type: 'text', required: true }

const INPUT = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]'
const INPUT_SM = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#2398c2]/30'

import { usePreferences } from '../../context/PreferencesContext'
import { translations } from '../../i18n/translations'

export default function FormsPage() {
  const { can } = useAuth()
  const { lang } = usePreferences()
  const tr = (key) => translations[lang]?.[key] ?? key
  const qc      = useQueryClient()
  const toast   = useToast()
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
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['forms'] }); closeModal(); toast.success('הטופס נוצר בהצלחה') },
    onError:    (e) => setError(e.response?.data?.message ?? 'שגיאה ביצירת הטופס'),
  })
  const remove = useMutation({
    mutationFn: (id) => client.delete(`/forms/${id}`),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['forms'] }); toast.success('הטופס נמחק') },
  })

  const forms = Array.isArray(data) ? data : (data?.data ?? [])

  const closeModal = () => { setShowModal(false); setName(''); setStage(''); setFields([{ ...EMPTY_FIELD }]); setError('') }
  // Removed `if (!navigator.clipboard)` check as it's not needed for the requested scope.
  const setField = (i, key) => (e) => setFields(fs => fs.map((f, idx) => idx === i ? { ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } : f))
  const addField = () => setFields(fs => [...fs, { ...EMPTY_FIELD }])
  const removeField = (i) => setFields(fs => fs.filter((_, idx) => idx !== i))

  const submit = (e) => {
    e.preventDefault()
    setError('')
    const validFields = fields.filter(f => f.label.trim())
    if (!name.trim()) return setError('שם הטופס חובה')
    if (!validFields.length) return setError('חובה שדה אחד לפחות')
    create.mutate({ name, fields: validFields, destination_pipeline_id: stage || undefined, active: true })
  }

  const copyLink = (form) => {
    navigator.clipboard?.writeText(`${window.location.origin}/f/${form.slug}`)
    toast.success('הקישור הועתק!')
  }

  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{tr('forms')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{tr('forms_description')}</p>
        </div>
        {can('forms', 'can_create') && (
          <button onClick={() => setShowModal(true)}
            className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm">
            <span className="text-lg leading-none">+</span> טופס חדש
          </button>
        )}
      </div>

      {isLoading ? <div className="text-gray-500 dark:text-gray-400 text-sm">טוען...</div> : (
        <div className="space-y-3">
          {forms.map(form => (
            <div key={form.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{form.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate" dir="ltr">{window.location.origin}/f/{form.slug}</span>
                    <button onClick={() => copyLink(form)} className="text-[#2398c2] text-xs hover:underline flex-shrink-0">{tr('copy')}</button>
                  </div>
                  <div className="flex gap-3 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <span>{form.fields?.length ?? 0} שדות</span>
                    {form.submission_count != null && <span>{form.submission_count} הגשות</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${form.active ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
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
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <div className="text-4xl mb-3">📝</div>
              <div className="text-sm">אין טפסים עדיין</div>
              {can('forms', 'can_create') && (
                <button onClick={() => setShowModal(true)} className="mt-3 text-[#2398c2] hover:underline text-sm">צור טופס ראשון</button>
              )}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={closeModal}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">טופס חדש</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={submit} className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם הטופס <span className="text-red-500">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="לדוגמה: טופס יצירת קשר" className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שלב יעד ללידים</label>
                <select value={stage} onChange={e => setStage(e.target.value)} className={INPUT}>
                  <option value="">שלב ברירת מחדל</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">שדות הטופס</label>
                <div className="space-y-2">
                  {fields.map((f, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={f.label} onChange={setField(i, 'label')} placeholder="תווית השדה"
                        className={INPUT_SM + ' flex-1'} />
                      <select value={f.type} onChange={setField(i, 'type')} className={INPUT_SM + ' w-28'}>
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        <input type="checkbox" checked={f.required} onChange={setField(i, 'required')} className="rounded border-gray-300 accent-[#2398c2]" />
                        חובה
                      </label>
                      {fields.length > 1 && (
                        <button type="button" onClick={() => removeField(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addField} className="mt-2 text-[#2398c2] hover:underline text-sm font-medium">+ הוסף שדה</button>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={create.isPending}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {create.isPending ? 'שומר...' : 'צור טופס'}
                </button>
                <button type="button" onClick={closeModal} className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
