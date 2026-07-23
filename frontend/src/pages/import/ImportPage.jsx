import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useUploadCsv, useStartImport, useImportStatus, useDistinctValues } from '../../hooks/useImport'
import { usePipeline } from '../../hooks/usePipeline'
import { customFieldsApi } from '../../api/customFields'
import { recordTypesApi } from '../../api/recordTypes'

const FIELDS = [
  { key: 'name',   label: 'שם *',   required: true },
  { key: 'phone',  label: 'טלפון' },
  { key: 'email',  label: 'אימייל' },
  { key: 'source', label: 'מקור' },
  { key: 'notes',  label: 'הערות' },
  { key: 'created_at', label: 'נוצר בתאריך (תאריך + שעה)' },
  { key: 'status', label: 'סטטוס / שלב' },
]

const AUTO = {
  name:   ['שם', 'name', 'שם מלא', 'full name', 'שם פרטי'],
  phone:  ['טלפון', 'phone', 'נייד', 'mobile', 'טלפון נייד', 'סלולרי'],
  email:  ['אימייל', 'email', 'מייל', 'דוא"ל', 'e-mail'],
  source: ['מקור', 'source', 'ערוץ', 'מקור הגעה', 'מקור ליד', 'מאיפה', 'מקור הגעה (קישור', 'origin', 'lead source', 'referral'],
  notes:  ['הערות', 'notes', 'הערה', 'comments', 'תיאור'],
  status: ['סטטוס', 'status', 'שלב', 'stage', 'מצב'],
  created_at: ['נוצר בתאריך', 'תאריך יצירה', 'נוצר ב', 'created', 'creation date', 'תאריך'],
}

const CREATE_NEW = '__create__'
const SKIP = '__skip__'

const SELECT_CLS = 'flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30'

export default function ImportPage() {
  const [searchParams] = useSearchParams()
  const entity = searchParams.get('entity') || 'leads'
  const isLeads = entity === 'leads'

  const [step, setStep]       = useState(1)
  const [uploaded, setUp]     = useState(null)
  const [mapping, setMapping] = useState({})
  const [statusValues, setStatusValues]   = useState([])
  const [statusMapping, setStatusMapping] = useState({}) // { [csvValue]: stageId | CREATE_NEW | SKIP }
  const [newStageLabels, setNewStageLabels] = useState({}) // { [csvValue]: label } when CREATE_NEW chosen
  const [jobId, setJobId]     = useState(null)
  const [error, setError]     = useState('')

  const navigate = useNavigate()
  const upload = useUploadCsv()
  const start  = useStartImport()
  const distinctValues = useDistinctValues()
  const { data: pipeline } = usePipeline()
  const { data: job } = useImportStatus(jobId, step === 5)

  const { data: recordTypes = [] } = useQuery({
    queryKey: ['record-types'],
    queryFn:  () => recordTypesApi.list().then(r => r.data.data),
    enabled: !isLeads,
  })
  const recordType = recordTypes.find(t => t.slug === entity)

  const { data: customFieldDefs = [] } = useQuery({
    queryKey: ['custom-fields', entity],
    queryFn:  () => customFieldsApi.list(entity).then(r => r.data.data),
  })

  // Leads: system fields are hardcoded (tuned labels/synonyms) + tenant's custom lead
  // fields as extra targets. Record types: every field definition is a mapping target,
  // since there's no separate hardcoded list — plus a synthetic "created_at" target.
  const allFields = useMemo(() => {
    if (isLeads) {
      const customFields = customFieldDefs.filter(f => !f.is_system && !f.hidden)
      return [...FIELDS, ...customFields.map(f => ({ key: f.name, label: f.label }))]
    }
    const fields = customFieldDefs.filter(f => !f.hidden).map(f => ({
      key: f.name, label: f.name === 'title' ? `${f.label} *` : f.label, required: f.name === 'title',
    }))
    return [...fields, { key: 'created_at', label: 'נוצר בתאריך (תאריך + שעה)' }]
  }, [isLeads, customFieldDefs])

  const requiredKey = isLeads ? 'name' : 'title'

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    try {
      const res = await upload.mutateAsync(file)
      setUp(res)
      const m = {}
      allFields.forEach(f => {
        const hit = res.headers.find(h => {
          const hl = h.trim().toLowerCase()
          const synonyms = AUTO[f.key] ?? [f.label.toLowerCase()]
          return synonyms.some(a => hl === a.toLowerCase() || hl.includes(a.toLowerCase()))
        })
        if (hit) m[f.key] = hit
      })
      setMapping(m)
      setStep(2)
    } catch (err) {
      setError(err.response?.data?.message ?? 'שגיאה בהעלאת הקובץ')
    }
  }

  const handleMappingNext = async () => {
    if (!isLeads || !mapping.status) { setStep(4); return }
    setError('')
    try {
      const values = await distinctValues.mutateAsync({ importId: uploaded.import_id, column: mapping.status })
      setStatusValues(values)
      const stages = pipeline ?? []
      const defaults = {}
      values.forEach(v => {
        const match = stages.find(s => s.name.trim().toLowerCase() === v.trim().toLowerCase())
        defaults[v] = match ? match.id : CREATE_NEW
      })
      setStatusMapping(defaults)
      setNewStageLabels(Object.fromEntries(values.map(v => [v, v])))
      setStep(3)
    } catch (err) {
      setError(err.response?.data?.message ?? 'שגיאה בטעינת ערכי הסטטוס')
    }
  }

  const handleStart = async () => {
    setError('')
    try {
      const status_mapping = {}
      if (mapping.status) {
        statusValues.forEach(v => {
          const choice = statusMapping[v]
          if (choice === SKIP || choice == null) return
          status_mapping[v] = choice === CREATE_NEW ? { create: newStageLabels[v] || v } : choice
        })
      }
      const created = await start.mutateAsync({
        import_id: uploaded.import_id,
        entity,
        field_mapping: mapping,
        status_mapping,
      })
      setJobId(created.id)
      setStep(5)
    } catch (err) {
      setError(err.response?.data?.message ?? 'שגיאה בהתחלת הייבוא')
    }
  }

  const reset = () => {
    setStep(1); setUp(null); setMapping({}); setStatusValues([]); setStatusMapping({})
    setNewStageLabels({}); setJobId(null); setError('')
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <button onClick={() => navigate(-1)} className="text-sm text-[#2398c2] hover:underline flex items-center gap-1 mb-3">
          ← חזור
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          ייבוא {isLeads ? 'לידים' : recordType?.label ?? 'רשומות'} מ-CSV
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">העלה קובץ, מפה שדות, וייבא בקלות</p>
      </div>

      {/* Steps indicator */}
      <div className="flex gap-2 mb-6">
        {(isLeads ? ['העלאה', 'מיפוי', 'סטטוסים', 'אישור', 'ייבוא'] : ['העלאה', 'מיפוי', 'אישור', 'ייבוא']).map((s, i) => (
          <div key={s} className={`flex-1 text-center py-2 rounded-lg text-xs font-medium transition-colors ${
            step === i + 1 ? 'bg-[#2398c2] text-white'
            : step > i + 1 ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
          }`}>{i + 1}. {s}</div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>
      )}

      {step === 1 && (
        <label className="block border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center cursor-pointer hover:border-[#2398c2] hover:bg-[#2398c2]/5 transition-colors">
          <div className="text-4xl mb-2">📁</div>
          <div className="text-gray-600 dark:text-gray-300 font-medium">{upload.isPending ? 'מעלה...' : 'לחץ לבחירת קובץ CSV'}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">עד 10MB · קידוד UTF-8</div>
          <input type="file" accept=".csv" onChange={handleFile} className="hidden" disabled={upload.isPending} />
        </label>
      )}

      {step === 2 && uploaded && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">מיפוי שדות</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">התאם כל עמודה בקובץ לשדה במערכת. זוהה אוטומטית כשאפשר.</p>
          <div className="space-y-3">
            {allFields.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-28 text-sm text-gray-700 dark:text-gray-300">{f.label}</span>
                <select value={mapping[f.key] ?? ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                  className={SELECT_CLS}>
                  <option value="">— ללא —</option>
                  {uploaded.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-5">
            <button disabled={!mapping.name || distinctValues.isPending} onClick={handleMappingNext}
              className="bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {distinctValues.isPending ? 'טוען...' : 'המשך'}
            </button>
            <button onClick={reset} className="text-gray-500 dark:text-gray-400 px-3 py-2 text-sm">התחל מחדש</button>
          </div>
          {!mapping.name && <p className="text-xs text-red-500 mt-2">חובה למפות לפחות את שדה "שם"</p>}
        </div>
      )}

      {step === 3 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">מיפוי סטטוסים</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">לכל ערך סטטוס בקובץ, בחר לאיזה שלב קיים הוא מתאים או צור שלב חדש.</p>
          <div className="space-y-2">
            {statusValues.map(v => (
              <div key={v} className="flex items-center gap-3">
                <span className="w-40 text-sm text-gray-700 dark:text-gray-300 truncate" title={v}>{v}</span>
                <select value={statusMapping[v] ?? SKIP}
                  onChange={e => {
                    const val = e.target.value
                    setStatusMapping(m => ({ ...m, [v]: val === SKIP || val === CREATE_NEW ? val : Number(val) }))
                  }}
                  className={SELECT_CLS}>
                  <option value={SKIP}>— דלג (אל תשייך לשלב) —</option>
                  <option value={CREATE_NEW}>+ צור שלב חדש</option>
                  {(pipeline ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {statusMapping[v] === CREATE_NEW && (
                  <input value={newStageLabels[v] ?? v}
                    onChange={e => setNewStageLabels(m => ({ ...m, [v]: e.target.value }))}
                    className={SELECT_CLS} placeholder="שם השלב החדש" />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setStep(4)}
              className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white px-4 py-2 rounded-lg text-sm font-medium">המשך</button>
            <button onClick={() => setStep(2)} className="text-gray-500 dark:text-gray-400 px-3 py-2 text-sm">חזור למיפוי</button>
          </div>
        </div>
      )}

      {step === 4 && uploaded && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">תצוגה מקדימה</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">10 השורות הראשונות, ממופות. כפילויות טלפון ידולגו אוטומטית.</p>
          <div className="overflow-x-auto border dark:border-gray-700 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                <tr>{allFields.filter(f => mapping[f.key]).map(f => (
                  <th key={f.key} className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">{f.label.replace(' *', '')}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {uploaded.preview.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    {allFields.filter(f => mapping[f.key]).map(f => (
                      <td key={f.key} className="px-3 py-2 text-gray-600 dark:text-gray-400">{row[mapping[f.key]] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={handleStart} disabled={start.isPending}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {start.isPending ? 'מתחיל...' : 'התחל ייבוא'}
            </button>
            <button onClick={() => setStep(mapping.status ? 3 : 2)} className="text-gray-500 dark:text-gray-400 px-3 py-2 text-sm">חזור</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center shadow-sm">
          {job?.status === 'done' ? (
            <>
              <div className="text-4xl mb-3">✅</div>
              <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 mb-2">הייבוא הושלם</h3>
              <p className="text-gray-600 dark:text-gray-400">יובאו <b className="text-green-600">{job.imported}</b> · דולגו <b className="text-amber-600">{job.skipped}</b> (כפילויות)</p>
              <button onClick={reset} className="mt-5 bg-[#2398c2] hover:bg-[#1d7fa3] text-white px-4 py-2 rounded-lg text-sm">ייבוא נוסף</button>
            </>
          ) : job?.status === 'failed' ? (
            <>
              <div className="text-4xl mb-3">❌</div>
              <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">הייבוא נכשל</h3>
              <button onClick={reset} className="mt-5 text-[#2398c2] hover:underline text-sm">נסה שוב</button>
            </>
          ) : (
            <>
              <div className="text-4xl mb-3 animate-pulse">⏳</div>
              <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">מייבא...</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">הקובץ מעובד ברקע, אנא המתן</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
