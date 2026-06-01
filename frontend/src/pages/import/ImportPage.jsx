import { useState } from 'react'
import { useUploadCsv, useStartImport, useImportStatus } from '../../hooks/useImport'

const FIELDS = [
  { key: 'name',   label: 'שם *',   required: true },
  { key: 'phone',  label: 'טלפון' },
  { key: 'email',  label: 'אימייל' },
  { key: 'source', label: 'מקור' },
  { key: 'notes',  label: 'הערות' },
]

const AUTO = {
  name:   ['שם', 'name', 'שם מלא', 'full name', 'שם פרטי'],
  phone:  ['טלפון', 'phone', 'נייד', 'mobile', 'טלפון נייד', 'סלולרי'],
  email:  ['אימייל', 'email', 'מייל', 'דוא"ל', 'e-mail'],
  source: ['מקור', 'source', 'ערוץ', 'מקור הגעה', 'מקור ליד', 'מאיפה', 'מקור הגעה (קישור', 'origin', 'lead source', 'referral'],
  notes:  ['הערות', 'notes', 'הערה', 'comments', 'תיאור'],
}

export default function ImportPage() {
  const [step, setStep]       = useState(1)
  const [uploaded, setUp]     = useState(null)
  const [mapping, setMapping] = useState({})
  const [jobId, setJobId]     = useState(null)
  const [error, setError]     = useState('')

  const upload = useUploadCsv()
  const start  = useStartImport()
  const { data: job } = useImportStatus(jobId, step === 4)

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    try {
      const res = await upload.mutateAsync(file)
      setUp(res)
      const m = {}
      FIELDS.forEach(f => {
        // Partial match: a header like "מקור ההגעה" should map to source
        const hit = res.headers.find(h => {
          const hl = h.trim().toLowerCase()
          return (AUTO[f.key] ?? []).some(a => hl === a.toLowerCase() || hl.includes(a.toLowerCase()))
        })
        if (hit) m[f.key] = hit
      })
      setMapping(m)
      setStep(2)
    } catch (err) {
      setError(err.response?.data?.message ?? 'שגיאה בהעלאת הקובץ')
    }
  }

  const handleStart = async () => {
    setError('')
    try {
      const created = await start.mutateAsync({
        import_id: uploaded.import_id,
        field_mapping: mapping,
      })
      setJobId(created.id)
      setStep(4)
    } catch (err) {
      setError(err.response?.data?.message ?? 'שגיאה בהתחלת הייבוא')
    }
  }

  const reset = () => { setStep(1); setUp(null); setMapping({}); setJobId(null); setError('') }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ייבוא לידים מ-CSV</h1>
        <p className="text-sm text-gray-500 mt-0.5">העלה קובץ מ-Fireberry, מפה שדות, וייבא בקלות</p>
      </div>

      {/* Steps indicator */}
      <div className="flex gap-2 mb-6">
        {['העלאה', 'מיפוי', 'אישור', 'ייבוא'].map((s, i) => (
          <div key={s} className={`flex-1 text-center py-2 rounded-lg text-xs font-medium transition-colors ${
            step === i + 1 ? 'bg-indigo-600 text-white'
            : step > i + 1 ? 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-400'
          }`}>{i + 1}. {s}</div>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

      {step === 1 && (
        <label className="block border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
          <div className="text-4xl mb-2">📁</div>
          <div className="text-gray-600 font-medium">{upload.isPending ? 'מעלה...' : 'לחץ לבחירת קובץ CSV'}</div>
          <div className="text-xs text-gray-400 mt-1">עד 10MB · קידוד UTF-8</div>
          <input type="file" accept=".csv" onChange={handleFile} className="hidden" disabled={upload.isPending} />
        </label>
      )}

      {step === 2 && uploaded && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold mb-1">מיפוי שדות</h3>
          <p className="text-xs text-gray-500 mb-4">התאם כל עמודה בקובץ לשדה במערכת. זוהה אוטומטית כשאפשר.</p>
          <div className="space-y-3">
            {FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-28 text-sm text-gray-700">{f.label}</span>
                <select value={mapping[f.key] ?? ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">— ללא —</option>
                  {uploaded.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-5">
            <button disabled={!mapping.name} onClick={() => setStep(3)}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium">המשך</button>
            <button onClick={reset} className="text-gray-500 px-3 py-2 text-sm">התחל מחדש</button>
          </div>
          {!mapping.name && <p className="text-xs text-red-500 mt-2">חובה למפות לפחות את שדה "שם"</p>}
        </div>
      )}

      {step === 3 && uploaded && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold mb-1">תצוגה מקדימה</h3>
          <p className="text-xs text-gray-500 mb-4">10 השורות הראשונות, ממופות. כפילויות טלפון ידולגו אוטומטית.</p>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{FIELDS.filter(f => mapping[f.key]).map(f => <th key={f.key} className="px-3 py-2 text-right font-medium text-gray-600">{f.label.replace(' *','')}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {uploaded.preview.map((row, i) => (
                  <tr key={i}>
                    {FIELDS.filter(f => mapping[f.key]).map(f => <td key={f.key} className="px-3 py-2 text-gray-600">{row[mapping[f.key]] || '—'}</td>)}
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
            <button onClick={() => setStep(2)} className="text-gray-500 px-3 py-2 text-sm">חזור למיפוי</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-sm">
          {job?.status === 'done' ? (
            <>
              <div className="text-4xl mb-3">✅</div>
              <h3 className="font-semibold text-lg mb-2">הייבוא הושלם</h3>
              <p className="text-gray-600">יובאו <b className="text-green-600">{job.imported}</b> · דולגו <b className="text-amber-600">{job.skipped}</b> (כפילויות)</p>
              <button onClick={reset} className="mt-5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm">ייבוא נוסף</button>
            </>
          ) : job?.status === 'failed' ? (
            <>
              <div className="text-4xl mb-3">❌</div>
              <h3 className="font-semibold text-lg">הייבוא נכשל</h3>
              <button onClick={reset} className="mt-5 text-indigo-600 hover:underline text-sm">נסה שוב</button>
            </>
          ) : (
            <>
              <div className="text-4xl mb-3 animate-pulse">⏳</div>
              <h3 className="font-semibold text-lg">מייבא...</h3>
              <p className="text-gray-500 text-sm mt-1">הקובץ מעובד ברקע, אנא המתן</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
