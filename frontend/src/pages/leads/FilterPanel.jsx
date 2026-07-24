import { useState } from 'react'

const DATE_PRESETS = [
  { id: '',        label: 'הכל' },
  { id: 'today',   label: 'היום' },
  { id: 'week',    label: '7 ימים אחרונים' },
  { id: 'month',   label: '30 ימים אחרונים' },
  { id: 'quarter', label: '90 ימים אחרונים' },
  { id: 'year',    label: 'שנה אחרונה' },
  { id: 'custom',  label: 'טווח מותאם' },
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

function presetToRange(id) {
  const now = new Date()
  const start = new Date(now)
  switch (id) {
    case 'today':   start.setHours(0, 0, 0, 0); return { from: start.toISOString(), to: now.toISOString() }
    case 'week':    start.setDate(now.getDate() - 7);   return { from: start.toISOString(), to: now.toISOString() }
    case 'month':   start.setDate(now.getDate() - 30);  return { from: start.toISOString(), to: now.toISOString() }
    case 'quarter': start.setDate(now.getDate() - 90);  return { from: start.toISOString(), to: now.toISOString() }
    case 'year':    start.setDate(now.getDate() - 365); return { from: start.toISOString(), to: now.toISOString() }
    default: return { from: '', to: '' }
  }
}

export default function FilterPanel({ fields, conditions, onApply, onClose }) {
  const [preset, setPreset]         = useState('')
  // Initialize states with props to allow external control, but use local state for editing
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [rows, setRows]             = useState(conditions.length ? conditions : [{ field: fields[0]?.key ?? '', operator: 'equals', value: '' }])

  const addRow = () => setRows(r => [...r, { field: fields[0]?.key ?? '', operator: 'equals', value: '' }])
  const removeRow = (i) => setRows(r => r.filter((_, idx) => idx !== i))
  const updateRow = (i, patch) => setRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row))

  const needsValue = (op) => op !== 'empty' && op !== 'not_empty'

  const apply = () => {
    const dateRange = preset === 'custom'
      ? { from: customFrom ? new Date(customFrom).toISOString() : '', to: customTo ? new Date(customTo + 'T23:59:59').toISOString() : '' }
      : presetToRange(preset)

    const validConditions = rows.filter(r => r.field && r.operator && (!needsValue(r.operator) || String(r.value).trim() !== ''))

    onApply({ dateFrom: dateRange.from, dateTo: dateRange.to, conditions: validConditions })
    onClose()
  }

  const clear = () => {
    setPreset(''); setCustomFrom(''); setCustomTo('')
    setRows([{ field: fields[0]?.key ?? '', operator: 'equals', value: '' }])
    onApply({ dateFrom: '', dateTo: '', conditions: [] })
    onClose()
  }

  return (
    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 p-4 w-[420px] max-h-[70vh] overflow-y-auto">
      <div className="mb-4">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">טווח תאריכים</div>
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map(p => (
            <button key={p.id} type="button" onClick={() => setPreset(p.id)}
              className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${preset === p.id ? 'bg-[#2398c2] text-white border-[#2398c2]' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex gap-2 mt-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" dir="ltr" />
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" dir="ltr" />
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">תנאי סינון</div>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select value={row.field} onChange={e => updateRow(i, { field: e.target.value })}
                className="flex-[1.2] border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <select value={row.operator} onChange={e => updateRow(i, { operator: e.target.value })}
                className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                {OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              {needsValue(row.operator) && (
                <input type="text" value={row.value} onChange={e => updateRow(i, { value: e.target.value })}
                  placeholder="ערך..."
                  className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              )}
              <button type="button" onClick={() => removeRow(i)} disabled={rows.length === 1}
                className="text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-default flex-shrink-0 px-1">×</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addRow}
          className="mt-2 text-xs text-[#2398c2] hover:underline">+ הוסף תנאי</button>
      </div>

      <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
        <button type="button" onClick={apply}
          className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] text-white py-2 rounded-lg text-sm font-medium">החל סינון</button>
        <button type="button" onClick={clear}
          className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">נקה</button>
      </div>
    </div>
  )
}
