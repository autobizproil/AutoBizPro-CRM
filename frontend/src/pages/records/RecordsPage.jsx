import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recordTypesApi, recordsApi } from '../../api/recordTypes'
import { customFieldsApi } from '../../api/customFields'
import { paymentLinesApi } from '../../api/paymentLines'
import { PAYMENT_TYPES } from '../../constants/paymentTypes'
import { useAuth } from '../../context/AuthContext'
import FilterPanel from '../leads/FilterPanel'
import { useDeleteAllEntity } from '../../hooks/useBulkDelete'
import DeleteAllModal from '../../components/ui/DeleteAllModal'
import SavedViewsBar from '../../components/ui/SavedViewsBar'

const INPUT = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]'
const LABEL = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

function fieldInputType(fieldType) {
  return { number: 'number', date: 'date', datetime: 'datetime-local', email: 'email', phone: 'tel', url: 'url' }[fieldType] ?? 'text'
}

// Trim imported values like "1540.0000" down to "1,540" / "234.92" — only as
// many decimals as the value actually needs, up to 2.
function formatDisplayValue(val, fieldType) {
  if (fieldType !== 'number') return String(val)
  const n = Number(val)
  return Number.isNaN(n) ? String(val) : n.toLocaleString('he-IL', { maximumFractionDigits: 2 })
}

import { usePreferences } from '../../context/PreferencesContext'
import { translations } from '../../i18n/translations'

export default function RecordsPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const { lang } = usePreferences()
  const tr = (key) => translations[lang]?.[key] ?? key
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [editing, setEditing] = useState(null) // record being edited, or null for create
  const [form, setForm]     = useState({})
  const [error, setError]   = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [advFilter, setAdvFilter]   = useState({ dateFrom: '', dateTo: '', conditions: [] })

  const { data: types = [] } = useQuery({
    queryKey: ['record-types'],
    queryFn:  () => recordTypesApi.list().then(r => r.data.data),
  })
  const type = types.find(t => t.slug === slug)

  const { data: fields = [] } = useQuery({
    queryKey: ['custom-fields', slug],
    queryFn:  () => customFieldsApi.list(slug).then(r => r.data.data),
    enabled: !!slug,
  })
  const visibleFields = fields.filter(f => !f.hidden).sort((a, b) => a.sort_order - b.sort_order)
  const FILTER_FIELDS = fields.filter(f => !f.hidden).map(f => ({ key: f.name, label: f.label }))
  const activeFilterCount = (advFilter.dateFrom || advFilter.dateTo ? 1 : 0) + advFilter.conditions.length

  const { data, isLoading } = useQuery({
    queryKey: ['records', slug, search, advFilter],
    queryFn:  () => recordsApi.list(type.id, {
      search,
      date_from: advFilter.dateFrom || undefined,
      date_to: advFilter.dateTo || undefined,
      conditions: advFilter.conditions.length ? JSON.stringify(advFilter.conditions) : undefined,
    }).then(r => r.data.data),
    enabled: !!type,
  })

  const records = data?.data ?? []
  const total   = data?.total ?? 0

  const invalidate = () => qc.invalidateQueries({ queryKey: ['records', slug] })

  const createRecord = useMutation({
    mutationFn: (d) => recordsApi.create(type.id, d),
    onSuccess:  () => { invalidate(); closeModal() },
    onError:    (err) => setError(err.response?.data?.message ?? 'שגיאה בשמירה'),
  })
  const updateRecord = useMutation({
    mutationFn: ({ id, d }) => recordsApi.update(type.id, id, d),
    onSuccess:  () => { invalidate(); closeModal() },
    onError:    (err) => setError(err.response?.data?.message ?? 'שגיאה בשמירה'),
  })
  const deleteRecord = useMutation({
    mutationFn: (id) => recordsApi.destroy(type.id, id),
    onSuccess:  invalidate,
  })

  const { data: paymentLines = [] } = useQuery({
    queryKey: ['payment-lines', slug, editing?.id],
    queryFn:  () => paymentLinesApi.list(type.id, editing.id).then(r => r.data.data),
    enabled: !!type && !!editing && !!type.has_payment_lines,
  })
  const [lineWarning, setLineWarning] = useState('')
  const invalidateLines = () => qc.invalidateQueries({ queryKey: ['payment-lines', slug, editing?.id] })

  const createLine = useMutation({
    mutationFn: (d) => paymentLinesApi.create(type.id, editing.id, d),
    onSuccess:  (res) => { invalidateLines(); setLineWarning(res.data.warning ?? '') },
  })
  const updateLine = useMutation({
    mutationFn: ({ id, d }) => paymentLinesApi.update(type.id, editing.id, id, d),
    onSuccess:  (res) => { invalidateLines(); setLineWarning(res.data.warning ?? '') },
  })
  const deleteLine = useMutation({
    mutationFn: (id) => paymentLinesApi.destroy(type.id, editing.id, id),
    onSuccess:  (res) => { invalidateLines(); setLineWarning(res.data.warning ?? '') },
  })

  const deleteAll = useDeleteAllEntity(slug, ['records', slug])
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)

  const openCreate = () => { setEditing(null); setForm({}); setError(''); setModal(true) }
  const openEdit = (r) => { setEditing(r); setForm(r.data ?? {}); setError(''); setLineWarning(''); setModal(true) }
  const closeModal = () => { setModal(false); setEditing(null); setForm({}); setError(''); setLineWarning('') }

  const setField = (name) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [name]: val }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (editing) {
      updateRecord.mutate({ id: editing.id, d: form })
    } else {
      createRecord.mutate(form)
    }
  }

  const canCreate = can('leads', 'can_create')
  const canDelete = can('leads', 'can_delete')

  if (types.length > 0 && !type) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
        <div className="text-3xl mb-2">❓</div>
        <div>סוג רשומה לא נמצא</div>
        <button onClick={() => navigate('/settings')} className="mt-3 text-[#2398c2] hover:underline text-sm">חזרה להגדרות</button>
      </div>
    )
  }

  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {type?.icon && <span className="ml-2">{type.icon}</span>}{type?.label ?? tr('records_loading')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{total} {tr('records')}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <button onClick={() => navigate(`/import?entity=${slug}`)}
              className="border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
              📥 ייבוא CSV
            </button>
          )}
          {canCreate && (
            <button onClick={openCreate}
              className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
              <span className="text-lg leading-none">+</span> {type?.label_singular ?? 'רשומה'} חדשה
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input type="text" placeholder="🔍  חיפוש..."
          value={search} onChange={e => setSearch(e.target.value)}
          className={INPUT + ' max-w-[320px]'} />
        <div className="relative">
          <button onClick={() => setShowFilter(s => !s)}
            className={`border rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${activeFilterCount > 0 ? 'border-[#2398c2] bg-[#2398c2]/10 text-[#2398c2]' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
            סינון ▾
            {activeFilterCount > 0 && (
              <span className="bg-[#2398c2] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
          {showFilter && (
            <FilterPanel fields={FILTER_FIELDS} conditions={advFilter.conditions}
              onApply={setAdvFilter} onClose={() => setShowFilter(false)} />
          )}
        </div>
        <SavedViewsBar key={slug} entityType="records" entityKey={slug}
          currentState={{ search, dateFrom: advFilter.dateFrom, dateTo: advFilter.dateTo, conditions: advFilter.conditions }}
          onApply={(patch) => {
            setSearch(patch.search)
            setAdvFilter({ dateFrom: patch.dateFrom, dateTo: patch.dateTo, conditions: patch.conditions })
          }} />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 text-right">
              {visibleFields.map(f => (
                <th key={f.id} className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{f.label}</th>
              ))}
              <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{tr('created_at')}</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {isLoading && (
              <tr><td colSpan={visibleFields.length + 2} className="py-8 text-center text-gray-400 dark:text-gray-500">{tr('loading')}...</td></tr>
            )}
            {!isLoading && records.length === 0 && (
              <tr><td colSpan={visibleFields.length + 2} className="py-12 text-center text-gray-400 dark:text-gray-500">
                <div className="text-3xl mb-2">{type?.icon ?? '📄'}</div>
                <div>{tr('no_records_yet')}</div>
                {canCreate && (
                  <button onClick={openCreate} className="mt-3 text-[#2398c2] hover:underline text-sm">+ {tr('add_first_record')}</button>
                )}
              </td></tr>
            )}
            {records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors cursor-pointer" onClick={() => openEdit(r)}>
                {visibleFields.map(f => {
                  const val = r.data?.[f.name]
                  const empty = val === undefined || val === null || val === ''
                  return (
                    <td key={f.id} className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[220px] truncate"
                      dir={['number', 'date', 'datetime', 'email', 'phone', 'url'].includes(f.field_type) ? 'ltr' : 'auto'}>
                      {empty ? <span className="text-gray-300 dark:text-gray-600">—</span>
                        : f.field_type === 'checkbox' ? (val ? '✓' : '—')
                        : formatDisplayValue(val, f.field_type)}
                    </td>
                  )
                })}
                <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap" dir="ltr">
                  {new Date(r.created_at).toLocaleDateString('he-IL')}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  {canDelete && (
                    <button onClick={() => { if (confirm('למחוק רשומה זו?')) deleteRecord.mutate(r.id) }}
                      className="text-gray-300 dark:text-gray-600 hover:text-red-500 text-lg leading-none">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end mt-3">
        {canDelete && total > 0 && (
          <button onClick={() => setDeleteAllOpen(true)}
            className="border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors">מחק הכל</button>
        )}
      </div>

      <DeleteAllModal
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={() => deleteAll.mutateAsync()}
        entityLabel={type?.label ?? 'רשומות'}
        total={total}
      />

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={closeModal}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editing ? 'עריכת רשומה' : `${type?.label_singular ?? 'רשומה'} חדשה`}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <div className="grid grid-cols-2 gap-3">
                {fields.filter(f => !f.hidden).map(f => (
                  <div key={f.id} className={f.field_type === 'textarea' ? 'col-span-2' : ''}>
                    <label className={LABEL}>{f.label} {f.required && <span className="text-red-500">*</span>}</label>
                    {f.field_type === 'select' ? (
                      <select value={form[f.name] ?? ''} onChange={setField(f.name)} required={f.required} className={INPUT}>
                        <option value="">בחר...</option>
                        {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.field_type === 'checkbox' ? (
                      <input type="checkbox" checked={!!form[f.name]} onChange={setField(f.name)}
                        className="rounded border-gray-300 accent-[#2398c2] w-5 h-5" />
                    ) : f.field_type === 'textarea' ? (
                      <textarea value={form[f.name] ?? ''} onChange={setField(f.name)} required={f.required} rows={2}
                        className={INPUT + ' resize-none'} />
                    ) : (
                      <input type={fieldInputType(f.field_type)} value={form[f.name] ?? ''} onChange={setField(f.name)} required={f.required}
                        dir={['number', 'date', 'datetime', 'email', 'phone', 'url'].includes(f.field_type) ? 'ltr' : 'auto'}
                        className={INPUT} />
                    )}
                  </div>
                ))}
              </div>
              {editing && type?.has_payment_lines && (
                <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">שורות תשלום</h3>
                    <button type="button"
                      onClick={() => createLine.mutate({ payment_type: PAYMENT_TYPES[0].id, amount: 0 })}
                      className="text-xs text-[#2398c2] hover:underline">+ הוסף שורה</button>
                  </div>
                  {lineWarning && (
                    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs px-3 py-2 rounded-lg mb-2">
                      {lineWarning}
                    </div>
                  )}
                  <div className="space-y-2">
                    {paymentLines.map(line => (
                      <div key={line.id} className="flex items-center gap-2">
                        <select value={line.payment_type}
                          onChange={e => updateLine.mutate({ id: line.id, d: { payment_type: e.target.value } })}
                          className={INPUT + ' flex-1'}>
                          {PAYMENT_TYPES.map(pt => <option key={pt.id} value={pt.id}>{pt.label}</option>)}
                        </select>
                        <input type="number" step="0.01" value={line.amount}
                          onChange={e => updateLine.mutate({ id: line.id, d: { amount: e.target.value } })}
                          className={INPUT + ' w-28'} dir="ltr" />
                        <input type="date" value={line.paid_at ?? ''}
                          onChange={e => updateLine.mutate({ id: line.id, d: { paid_at: e.target.value || null } })}
                          className={INPUT + ' w-40'} dir="ltr" />
                        <button type="button" onClick={() => deleteLine.mutate(line.id)}
                          className="text-gray-300 dark:text-gray-600 hover:text-red-500 text-lg leading-none">×</button>
                      </div>
                    ))}
                    {paymentLines.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">אין שורות תשלום עדיין</p>
                    )}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={createRecord.isPending || updateRecord.isPending}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
                  {createRecord.isPending || updateRecord.isPending ? 'שומר...' : editing ? 'שמור שינויים' : 'הוסף'}
                </button>
                <button type="button" onClick={closeModal}
                  className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
