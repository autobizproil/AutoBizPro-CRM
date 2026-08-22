import { useState, useRef, useEffect } from 'react'

// Searchable single-select, mirroring Fireberry's magnifier lookup input.
export default function LookupSelect({ options, value, onChange, placeholder = 'בחר...', disabled = false }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const boxRef              = useRef(null)

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const selected = options.find(o => String(o.id) === String(value))
  const filtered = search
    ? options.filter(o => o.name?.toLowerCase().includes(search.toLowerCase()))
    : options

  return (
    <div className="relative flex-1 min-w-0" ref={boxRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-1 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-60 disabled:cursor-default"
      >
        <span className="truncate">{selected?.name ?? placeholder}</span>
        <span className="text-gray-400 flex-shrink-0">🔍</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חפש..."
            className="w-full border-b border-gray-100 dark:border-gray-700 px-2 py-1.5 text-xs bg-transparent outline-none"
          />
          {filtered.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onChange(String(o.id)); setOpen(false); setSearch('') }}
              className={`w-full text-right px-2 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 ${
                String(o.id) === String(value) ? 'text-[#2398c2] font-medium' : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              {o.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-2 text-xs text-gray-400">אין תוצאות</div>
          )}
        </div>
      )}
    </div>
  )
}
