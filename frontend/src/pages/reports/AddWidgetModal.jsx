import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import WidgetCard from './WidgetCard'
import FilterValueInput from './FilterValueInput'
import { dashboardApi } from '../../api/dashboard'
import { emptyWidgetDraft } from '../../lib/widgetConfig'
import { useToast } from '../../context/ToastContext'

const CHART_TYPES = [
  { id: 'bar',   icon: '📊', label: 'עמודות אנכי'  },
  { id: 'bar_h', icon: '📉', label: 'עמודות אופקי' },
  { id: 'pie',   icon: '◉',  label: 'עוגה'          },
  { id: 'line',  icon: '📈', label: 'קו'             },
  { id: 'table', icon: '⊞',  label: 'טבלה'          },
  { id: 'kpi',   icon: '#',  label: 'מד'             },
]

const CONDITION_OPERATORS = [
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

const needsConditionValue = (op) => op !== 'empty' && op !== 'not_empty'

function ConditionRow({ row, filterFields, lookups, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-1.5">
      <select value={row.field} onChange={e => onChange({ field: e.target.value, value: '' })}
        className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
        {Object.entries(filterFields).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
      </select>
      <select value={row.operator} onChange={e => onChange({ operator: e.target.value })}
        className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
        {CONDITION_OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {needsConditionValue(row.operator) && (
        <FilterValueInput field={filterFields[row.field]} lookups={lookups} value={row.value}
          onChange={v => onChange({ value: v })} />
      )}
      <button type="button" onClick={onRemove} className="text-gray-300 hover:text-red-500 flex-shrink-0 px-0.5">×</button>
    </div>
  )
}

const LABEL_CLASS  = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const SELECT_CLASS = 'w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30'

export default function AddWidgetModal({ onSave, onClose }) {
  const toast = useToast()
  const [draft, setDraft] = useState(emptyWidgetDraft)

  const { data: meta } = useQuery({
    queryKey: ['widget-fields'],
    queryFn:  () => dashboardApi.widgetFields().then(r => r.data.data),
    staleTime: 5 * 60_000,
  })

  const entityFields  = meta?.fields?.[draft.entity]
  const groupFields   = entityFields?.groupFields  ?? {}
  const filterFields  = entityFields?.filterFields ?? {}
  const dateFields    = entityFields?.dateFields   ?? {}
  const valueFields   = entityFields?.valueFields  ?? {}
  const dateOperators = meta?.dateOperators ?? []
  const aggregations  = meta?.aggregations  ?? []

  const patch = (p) => setDraft(d => ({ ...d, ...p }))

  const firstGroupField = (entity) => Object.keys(meta?.fields?.[entity]?.groupFields ?? {})[0] ?? ''

  function handleEntityChange(entity) {
    // Field keys are entity-specific — reset every field-bound choice
    const nextFields = meta?.fields?.[entity]
    const firstDate = Object.keys(nextFields?.dateFields ?? {})[0] ?? ''
    patch({
      entity,
      displayField: firstGroupField(entity),
      valueField:   '',
      aggregation:  'count',
      timePeriod:   { field: firstDate, operator: '', value: '' },
      conditions:   [],
      orConditions: [],
      groupBy:      { field: '', granularity: 'month' },
    })
  }

  function handleTypeChange(typeId) {
    // KPI is ungrouped — a stale displayField would push the backend down the
    // GROUP BY path and corrupt avg/max/min aggregations. Clear it on entry,
    // restore a sensible default when switching back to a chart type.
    patch({
      type:         typeId,
      displayField: typeId === 'kpi' ? '' : (draft.displayField || firstGroupField(draft.entity)),
    })
  }

  const addCondition    = () => patch({ conditions: [...draft.conditions, { field: Object.keys(filterFields)[0] ?? '', operator: 'equals', value: '' }] })
  const removeCondition = (i) => patch({ conditions: draft.conditions.filter((_, idx) => idx !== i) })
  const updateCondition = (i, p) => patch({ conditions: draft.conditions.map((c, idx) => idx === i ? { ...c, ...p } : c) })

  const addOrCondition    = () => patch({ orConditions: [...draft.orConditions, { field: Object.keys(filterFields)[0] ?? '', operator: 'equals', value: '' }] })
  const removeOrCondition = (i) => patch({ orConditions: draft.orConditions.filter((_, idx) => idx !== i) })
  const updateOrCondition = (i, p) => patch({ orConditions: draft.orConditions.map((c, idx) => idx === i ? { ...c, ...p } : c) })

  const validConditions = draft.conditions.filter(c =>
    c.field && c.operator && (!needsConditionValue(c.operator) || String(c.value ?? '').trim() !== '')
  )
  const validOrConditions = draft.orConditions.filter(c =>
    c.field && c.operator && (!needsConditionValue(c.operator) || String(c.value ?? '').trim() !== '')
  )

  const selectedDateOperator = dateOperators.find(o => o.id === draft.timePeriod.operator)

  const previewWidget = {
    ...draft,
    id:         '__preview__',
    title:      draft.title || 'תצוגה מקדימה',
    conditions: validConditions,
    orConditions: validOrConditions,
  }

  function handleSave() {
    if (!draft.title.trim()) {
      toast.warn('נא להזין כותרת')
      return
    }
    onSave({ ...draft, title: draft.title.trim(), conditions: validConditions, orConditions: validOrConditions })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col max-h-[92vh] overflow-hidden" dir="rtl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">הוסף Widget</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">&times;</button>
        </div>

        {/* Chart type tabs */}
        <div className="flex gap-2 px-6 py-4 border-b border-gray-100 dark:border-gray-700 overflow-x-auto flex-shrink-0">
          {CHART_TYPES.map(ct => (
            <button key={ct.id} onClick={() => handleTypeChange(ct.id)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                draft.type === ct.id
                  ? 'border-[#2398c2] bg-[#2398c2]/10 text-[#2398c2]'
                  : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}>
              <span className="text-lg leading-none">{ct.icon}</span>
              <span>{ct.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Form — Fireberry field order */}
          <div className="w-96 flex-shrink-0 border-l border-gray-100 dark:border-gray-700 p-6 overflow-y-auto space-y-5">

            <div>
              <label className={LABEL_CLASS}>סוג נתונים</label>
              <select value={draft.entity} onChange={e => handleEntityChange(e.target.value)} className={SELECT_CLASS}>
                {(meta?.entities ?? []).map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS}>כותרת הגרף</label>
              <input type="text" value={draft.title} onChange={e => patch({ title: e.target.value })}
                placeholder="הזן כותרת..." className={SELECT_CLASS} />
            </div>

            <div>
              <label className={LABEL_CLASS}>ערכים</label>
              <div className="flex gap-2">
                <select value={draft.valueField} onChange={e => patch({ valueField: e.target.value })}
                  className={SELECT_CLASS} disabled={Object.keys(valueFields).length === 0}>
                  <option value="">מספר רשומות</option>
                  {Object.entries(valueFields).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </select>
                <select value={draft.aggregation} onChange={e => patch({ aggregation: e.target.value })}
                  className={SELECT_CLASS} disabled={!draft.valueField}>
                  {aggregations.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            </div>

            {draft.type !== 'kpi' && (
              <div>
                <label className={LABEL_CLASS}>שדה להצגה</label>
                <select value={draft.displayField} onChange={e => patch({ displayField: e.target.value })} className={SELECT_CLASS}>
                  {Object.entries(groupFields).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </select>
              </div>
            )}

            {(draft.type === 'bar' || draft.type === 'bar_h') && (
              <div>
                <label className={LABEL_CLASS}>קיבוץ נתונים (סדרה שנייה)</label>
                <div className="flex gap-2">
                  <select value={draft.groupBy?.field ?? ''}
                    onChange={e => patch({ groupBy: { field: e.target.value, granularity: 'month' } })}
                    className={SELECT_CLASS}>
                    <option value="">ללא</option>
                    {Object.entries(groupFields).filter(([k]) => k !== draft.displayField)
                      .map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                  </select>
                  {groupFields[draft.groupBy?.field]?.type === 'date' && (
                    <select value={draft.groupBy?.granularity ?? 'month'}
                      onChange={e => patch({ groupBy: { ...draft.groupBy, granularity: e.target.value } })}
                      className={SELECT_CLASS}>
                      <option value="day">יום</option>
                      <option value="week">שבוע</option>
                      <option value="month">חודש</option>
                      <option value="year">שנה</option>
                    </select>
                  )}
                </div>
                {draft.groupBy?.field && (
                  <div className="flex gap-3 mt-2">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                      <input type="radio" name="variant" checked={draft.variant !== 'stacked'}
                        onChange={() => patch({ variant: 'grouped' })} />
                      זה לצד זה
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                      <input type="radio" name="variant" checked={draft.variant === 'stacked'}
                        onChange={() => patch({ variant: 'stacked' })} />
                      מוערם
                    </label>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className={LABEL_CLASS}>צבע טקסט</label>
              <div className="flex items-center gap-2">
                <input type="color" value={draft.color} onChange={e => patch({ color: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer p-0.5 bg-white dark:bg-gray-700" />
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{draft.color}</span>
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>תקופת זמן</label>
              <div className="flex gap-2">
                <select value={draft.timePeriod.field}
                  onChange={e => patch({ timePeriod: { ...draft.timePeriod, field: e.target.value } })}
                  className={SELECT_CLASS}>
                  {Object.entries(dateFields).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <select value={draft.timePeriod.operator}
                  onChange={e => patch({ timePeriod: { ...draft.timePeriod, operator: e.target.value, value: '' } })}
                  className={SELECT_CLASS}>
                  <option value="">כל הזמן</option>
                  {dateOperators.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              {selectedDateOperator?.needsValue && (
                <input type="date" value={draft.timePeriod.value}
                  onChange={e => patch({ timePeriod: { ...draft.timePeriod, value: e.target.value } })}
                  className={`${SELECT_CLASS} mt-2`} dir="ltr" />
              )}
            </div>

            <div>
              <label className={LABEL_CLASS}>סינון רשומות</label>

              <div className="mb-3">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5 underline decoration-dotted">
                  התנאים שכולם חייבים להתקיים
                </p>
                <div className="space-y-2">
                  {draft.conditions.map((row, i) => (
                    <ConditionRow key={i} row={row} filterFields={filterFields} lookups={meta?.lookups}
                      onChange={p => updateCondition(i, p)} onRemove={() => removeCondition(i)} />
                  ))}
                </div>
                <button type="button" onClick={addCondition} className="mt-1.5 text-xs text-[#2398c2] hover:underline">
                  + הוסף סינון
                </button>
              </div>

              <div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5 underline decoration-dotted">
                  תנאים שלפחות אחד מהם מתקיים
                </p>
                <div className="space-y-2">
                  {draft.orConditions.map((row, i) => (
                    <ConditionRow key={i} row={row} filterFields={filterFields} lookups={meta?.lookups}
                      onChange={p => updateOrCondition(i, p)} onRemove={() => removeOrCondition(i)} />
                  ))}
                </div>
                <button type="button" onClick={addOrCondition} className="mt-1.5 text-xs text-[#2398c2] hover:underline">
                  + הוסף סינון
                </button>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 p-6 bg-gray-50 dark:bg-gray-900/50 overflow-y-auto">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">תצוגה מקדימה</div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
                {draft.title || 'כותרת Widget'}
              </div>
              <WidgetCard widget={previewWidget} preview={true} dateParams={{}} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-start gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
          <button onClick={handleSave}
            className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">שמור</button>
          <button onClick={onClose}
            className="border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium px-5 py-2 rounded-lg transition-colors">ביטול</button>
        </div>
      </div>
    </div>
  )
}
