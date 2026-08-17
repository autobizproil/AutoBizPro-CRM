import { useState } from 'react'
import WidgetCard from './WidgetCard'
import { useToast } from '../../context/ToastContext'

// ── Chart type definitions ────────────────────────────────────────────────────

const CHART_TYPES = [
  { id: 'bar',   icon: '📊', label: 'עמודות אנכי'  },
  { id: 'bar_h', icon: '📉', label: 'עמודות אופקי' },
  { id: 'pie',   icon: '◉',  label: 'עוגה'          },
  { id: 'line',  icon: '📈', label: 'קו'             },
  { id: 'table', icon: '⊞',  label: 'טבלה'          },
  { id: 'kpi',   icon: '#',  label: 'מד'             },
]

const DATA_SOURCES = [
  { id: 'leads_by_source', label: 'לידים לפי מקור'    },
  { id: 'leads_by_agent',  label: 'לידים לפי נציג'    },
  { id: 'activities',      label: 'פעילויות לפי סוג'  },
  { id: 'conversion',      label: 'משפך המרה'           },
  { id: 'timeline',        label: 'לידים לאורך זמן'   },
  { id: 'kpi_total',       label: 'סה״כ לידים'         },
  { id: 'kpi_new',         label: 'לידים היום'          },
  { id: 'kpi_open',        label: 'לידים פתוחים'       },
  { id: 'kpi_contacts',    label: 'אנשי קשר'            },
]

// Default data source per chart type
const TYPE_DEFAULT_SOURCE = {
  bar:   'leads_by_agent',
  bar_h: 'activities',
  pie:   'leads_by_source',
  line:  'timeline',
  table: 'leads_by_source',
  kpi:   'kpi_total',
}

// ── Filtering (Fireberry-style) ──────────────────────────────────────────────

const PERIOD_PRESETS = [
  { id: '',        label: 'כל הזמן' },
  { id: 'today',   label: 'היום' },
  { id: 'week',    label: '7 ימים' },
  { id: 'month',   label: '30 ימים' },
  { id: 'quarter', label: '90 ימים' },
  { id: 'year',    label: 'שנה' },
  { id: 'custom',  label: 'טווח מותאם' },
]

const CONDITION_FIELDS = [
  { key: 'name',              label: 'שם' },
  { key: 'phone',             label: 'טלפון' },
  { key: 'email',             label: 'אימייל' },
  { key: 'source',            label: 'מקור' },
  { key: 'status',            label: 'סטטוס' },
  { key: 'pipeline_stage_id', label: 'שלב' },
  { key: 'assigned_to',       label: 'נציג' },
  { key: 'created_at',        label: 'תאריך יצירה' },
]

const OPERATORS = [
  { id: 'equals',     label: 'שווה ל' },
  { id: 'not_equals', label: 'שונה מ' },
  { id: 'contains',   label: 'מכיל' },
  { id: 'gt',         label: 'גדול מ' },
  { id: 'gte',        label: 'גדול או שווה' },
  { id: 'lt',         label: 'קטן מ' },
  { id: 'lte',        label: 'קטן או שווה' },
  { id: 'empty',      label: 'ריק' },
  { id: 'not_empty',  label: 'לא ריק' },
]

const needsValue = (op) => op !== 'empty' && op !== 'not_empty'

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddWidgetModal({ onSave, onClose }) {
  const toast = useToast()
  const [type, setType]         = useState('bar')
  const [title, setTitle]       = useState('')
  const [dataSource, setSource] = useState(TYPE_DEFAULT_SOURCE['bar'])
  const [color, setColor]       = useState('#2398c2')
  const [period, setPeriod]     = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [conditions, setConditions] = useState([])

  function handleTypeChange(newType) {
    setType(newType)
    setSource(TYPE_DEFAULT_SOURCE[newType] ?? 'leads_by_source')
  }

  const addCondition    = () => setConditions(c => [...c, { field: 'name', operator: 'equals', value: '' }])
  const removeCondition = (i) => setConditions(c => c.filter((_, idx) => idx !== i))
  const updateCondition = (i, patch) => setConditions(c => c.map((row, idx) => idx === i ? { ...row, ...patch } : row))

  const validConditions = conditions.filter(c =>
    c.field && c.operator && (!needsValue(c.operator) || String(c.value).trim() !== '')
  )

  const filterProps = {
    period:     period && period !== 'custom' ? period : undefined,
    dateFrom:   period === 'custom' ? customFrom : undefined,
    dateTo:     period === 'custom' ? customTo : undefined,
    conditions: validConditions.length ? validConditions : undefined,
  }

  const previewWidget = {
    id: '__preview__',
    type,
    title: title || 'תצוגה מקדימה',
    dataSource,
    color,
    ...filterProps,
  }

  function handleSave() {
    if (!title.trim()) {
      toast.warn('נא להזין כותרת')
      return
    }
    onSave({ type, title: title.trim(), dataSource, color, ...filterProps })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col max-h-[92vh] overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">הוסף Widget</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">
            &times;
          </button>
        </div>

        {/* Chart type tabs */}
        <div className="flex gap-2 px-6 py-4 border-b border-gray-100 dark:border-gray-700 overflow-x-auto flex-shrink-0">
          {CHART_TYPES.map(ct => (
            <button
              key={ct.id}
              onClick={() => handleTypeChange(ct.id)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                type === ct.id
                  ? 'border-[#2398c2] bg-[#2398c2]/10 text-[#2398c2]'
                  : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-lg leading-none">{ct.icon}</span>
              <span>{ct.label}</span>
            </button>
          ))}
        </div>

        {/* Body: right=form, left=preview */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Right panel — form */}
          <div className="w-96 flex-shrink-0 border-l border-gray-100 dark:border-gray-700 p-6 overflow-y-auto space-y-5">

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">כותרת</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="הזן כותרת..."
                className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30"
              />
            </div>

            {/* Data source */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">סוג נתונים</label>
              <select
                value={dataSource}
                onChange={e => setSource(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30"
              >
                {DATA_SOURCES.map(ds => (
                  <option key={ds.id} value={ds.id}>{ds.label}</option>
                ))}
              </select>
            </div>

            {/* Color */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">צבע</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer p-0.5 bg-white dark:bg-gray-700"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{color}</span>
              </div>
            </div>

            {/* Time period */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">תקופת זמן</label>
              <div className="flex flex-wrap gap-1.5">
                {PERIOD_PRESETS.map(p => (
                  <button key={p.id} type="button" onClick={() => setPeriod(p.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                      period === p.id
                        ? 'bg-[#2398c2] text-white border-[#2398c2]'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
              {period === 'custom' && (
                <div className="flex gap-2 mt-2">
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" dir="ltr" />
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" dir="ltr" />
                </div>
              )}
            </div>

            {/* Record conditions */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">סינון רשומות</label>
              <div className="space-y-2">
                {conditions.map((row, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <select value={row.field} onChange={e => updateCondition(i, { field: e.target.value })}
                      className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      {CONDITION_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select value={row.operator} onChange={e => updateCondition(i, { operator: e.target.value })}
                      className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      {OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    {needsValue(row.operator) && (
                      <input type="text" value={row.value} onChange={e => updateCondition(i, { value: e.target.value })}
                        placeholder="ערך..."
                        className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        dir="auto" />
                    )}
                    <button type="button" onClick={() => removeCondition(i)}
                      className="text-gray-300 hover:text-red-500 flex-shrink-0 px-0.5">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addCondition}
                className="mt-1.5 text-xs text-[#2398c2] hover:underline">+ הוסף תנאי</button>
            </div>
          </div>

          {/* Left panel — preview */}
          <div className="flex-1 p-6 bg-gray-50 dark:bg-gray-900/50 overflow-y-auto">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">תצוגה מקדימה</div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
                {title || 'כותרת Widget'}
              </div>
              <WidgetCard widget={previewWidget} preview={true} dateParams={{}} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-start gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={handleSave}
            className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            שמור
          </button>
          <button
            onClick={onClose}
            className="border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
