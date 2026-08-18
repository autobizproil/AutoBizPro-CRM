import LookupSelect from './LookupSelect'

const INPUT_CLASS = 'flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'

// Renders the right input for a field's type, so a filter value is picked from
// real data (statuses, agents, stages) instead of typed free-hand.
export default function FilterValueInput({ field, lookups, value, onChange }) {
  if (!field) {
    return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="ערך..." className={INPUT_CLASS} dir="auto" />
  }

  if (field.type === 'enum') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={INPUT_CLASS}>
        <option value="">בחר...</option>
        {Object.entries(field.options ?? {}).map(([k, label]) => (
          <option key={k} value={k}>{label}</option>
        ))}
      </select>
    )
  }

  if (field.type === 'lookup') {
    const options = field.lookup === 'stages' ? (lookups?.stages ?? []) : (lookups?.users ?? [])
    return <LookupSelect options={options} value={value} onChange={onChange} />
  }

  if (field.type === 'date') {
    return <input type="date" value={value ?? ''} onChange={e => onChange(e.target.value)} className={INPUT_CLASS} dir="ltr" />
  }

  if (field.type === 'number') {
    return <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="ערך..." className={INPUT_CLASS} dir="ltr" />
  }

  return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="ערך..." className={INPUT_CLASS} dir="auto" />
}
