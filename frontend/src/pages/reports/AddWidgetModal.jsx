import { useState } from 'react'
import WidgetCard from './WidgetCard'

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddWidgetModal({ onSave, onClose }) {
  const [type, setType]         = useState('bar')
  const [title, setTitle]       = useState('')
  const [dataSource, setSource] = useState(TYPE_DEFAULT_SOURCE['bar'])
  const [color, setColor]       = useState('#2398c2')

  function handleTypeChange(newType) {
    setType(newType)
    setSource(TYPE_DEFAULT_SOURCE[newType] ?? 'leads_by_source')
  }

  const previewWidget = {
    id: '__preview__',
    type,
    title: title || 'תצוגה מקדימה',
    dataSource,
    color,
  }

  function handleSave() {
    if (!title.trim()) {
      alert('נא להזין כותרת')
      return
    }
    onSave({ type, title: title.trim(), dataSource, color })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col max-h-[90vh] overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">הוסף Widget</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            &times;
          </button>
        </div>

        {/* Chart type tabs */}
        <div className="flex gap-2 px-6 py-4 border-b border-gray-100 overflow-x-auto flex-shrink-0">
          {CHART_TYPES.map(ct => (
            <button
              key={ct.id}
              onClick={() => handleTypeChange(ct.id)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                type === ct.id
                  ? 'border-[#2398c2] bg-[#2398c2]/10 text-[#2398c2]'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
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
          <div className="w-72 flex-shrink-0 border-l border-gray-100 p-6 overflow-y-auto space-y-5">

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">כותרת</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="הזן כותרת..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            {/* Data source */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">סוג נתונים</label>
              <select
                value={dataSource}
                onChange={e => setSource(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              >
                {DATA_SOURCES.map(ds => (
                  <option key={ds.id} value={ds.id}>{ds.label}</option>
                ))}
              </select>
            </div>

            {/* Color (shown for all, but most useful for kpi/bar) */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">צבע</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                />
                <span className="text-xs text-gray-500 font-mono">{color}</span>
              </div>
            </div>
          </div>

          {/* Left panel — preview */}
          <div className="flex-1 p-6 bg-gray-50 overflow-y-auto">
            <div className="text-xs font-medium text-gray-500 mb-3">תצוגה מקדימה</div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">
                {title || 'כותרת Widget'}
              </div>
              <WidgetCard widget={previewWidget} preview={true} dateParams={{}} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-start gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleSave}
            className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            שמור
          </button>
          <button
            onClick={onClose}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
