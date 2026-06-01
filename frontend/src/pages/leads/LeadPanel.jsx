import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { leadsApi } from '../../api/leads'
import { useLead } from '../../hooks/useLeads'

const STATUS_LABELS = {
  new: 'ליד חדש',
  contacted: 'יצרנו קשר',
  qualified: 'מתאים',
  proposal: 'הצעה נשלחה',
  closed_won: 'נסגר ✓',
  closed_lost: 'לא רלוונטי',
}

const STATUS_COLORS = {
  new: 'text-pink-500',
  contacted: 'text-blue-500',
  qualified: 'text-green-600',
  proposal: 'text-orange-500',
  closed_won: 'text-emerald-600 font-semibold',
  closed_lost: 'text-red-500',
}

export default function LeadPanel({ leadId, onClose }) {
  const qc = useQueryClient()
  const { data: lead, isLoading } = useLead(leadId)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const panelRef = useRef(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      await leadsApi.addActivity(leadId, { type: 'note', body: newNote })
      setNewNote('')
      qc.invalidateQueries({ queryKey: ['leads', leadId] })
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        className="fixed top-0 left-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-900">
            {isLoading ? '...' : lead?.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">טוען...</div>
        ) : lead ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Fields */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label="טלפון">
                <span dir="ltr">{lead.phone ?? '—'}</span>
              </Field>
              <Field label="אימייל">
                <span className="truncate block">{lead.email ?? '—'}</span>
              </Field>
              <Field label="מקור הגעה">{lead.source ?? '—'}</Field>
              <Field label="נציג אחראי">{lead.assigned_user?.name ?? '—'}</Field>
              <Field label="שלב">
                {lead.stage ? (
                  <span
                    className="px-2 py-0.5 rounded text-xs text-white"
                    style={{ backgroundColor: lead.stage.color ?? '#6b7280' }}
                  >
                    {lead.stage.name}
                  </span>
                ) : (
                  <span className="text-gray-400">ללא שלב</span>
                )}
              </Field>
              <Field label="סטטוס">
                <span className={STATUS_COLORS[lead.status] ?? 'text-gray-400'}>
                  {STATUS_LABELS[lead.status] ?? lead.status ?? '—'}
                </span>
              </Field>
              <Field label="תאריך יצירה">
                {lead.created_at ? formatDate(lead.created_at) : '—'}
              </Field>
            </div>

            {/* Notes */}
            {lead.notes && (
              <div className="text-sm">
                <div className="text-gray-500 text-xs font-medium mb-1">הערות</div>
                <div className="bg-yellow-50 border border-yellow-100 rounded p-3 text-gray-700">
                  {lead.notes}
                </div>
              </div>
            )}

            {/* Activity feed */}
            <div>
              <div className="text-gray-500 text-xs font-medium mb-2">פעילות</div>
              <div className="space-y-2">
                {(lead.activities ?? []).map(act => (
                  <div key={act.id} className="text-sm bg-gray-50 rounded p-3 border border-gray-100">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{ACTIVITY_LABELS[act.type] ?? act.type}</span>
                      <span>{formatDate(act.created_at)}</span>
                    </div>
                    <div className="text-gray-700">{act.body}</div>
                  </div>
                ))}
                {(lead.activities ?? []).length === 0 && (
                  <div className="text-gray-400 text-xs">אין פעילות עדיין</div>
                )}
              </div>
            </div>

            {/* Add note */}
            <div>
              <div className="text-gray-500 text-xs font-medium mb-1">הוסף הערה</div>
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                rows={3}
                placeholder="כתוב הערה..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2] resize-none"
              />
              <button
                onClick={handleAddNote}
                disabled={savingNote || !newNote.trim()}
                className="mt-2 bg-[#2398c2] text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50 hover:bg-[#1d7fa3] transition-colors"
              >
                שמור הערה
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">לא נמצא</div>
        )}
      </div>
    </>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs text-gray-400 font-medium mb-0.5">{label}</div>
      <div className="text-gray-800">{children}</div>
    </div>
  )
}

function formatDate(dt) {
  if (!dt) return '—'
  const d = new Date(dt)
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = d.getFullYear()
  const hour  = String(d.getHours()).padStart(2, '0')
  const min   = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hour}:${min}`
}

const ACTIVITY_LABELS = {
  call: 'שיחה',
  note: 'הערה',
  email: 'אימייל',
  meeting: 'פגישה',
  task: 'משימה',
}
