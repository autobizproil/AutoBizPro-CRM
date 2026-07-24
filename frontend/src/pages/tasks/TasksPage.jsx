import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../../api/client'
import { tasksApi, PRIORITY_META } from '../../api/tasks'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

const INPUT = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30 focus:border-[#2398c2]'
const LABEL = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

const FILTERS = [
  { id: 'open',    label: 'פתוחות' },
  { id: 'overdue', label: 'באיחור' },
  { id: 'done',    label: 'הושלמו' },
  { id: 'all',     label: 'הכל' },
]

function fmtDue(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const overdue = d < now
  const today = d.toDateString() === now.toDateString()
  const str = today
    ? `היום ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
  return { str, overdue }
}

const EMPTY = { title: '', description: '', priority: 'medium', due_at: '', assigned_to: '' }

export default function TasksPage() {
  const { can, user } = useAuth()
  const qc    = useQueryClient()
  const toast = useToast()
  const [filter, setFilter] = useState('open')
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(EMPTY)
  const [error, setError]   = useState('')

  const params = filter === 'all' ? {} : filter === 'overdue' ? { overdue: true } : { status: filter }

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filter],
    queryFn:  () => tasksApi.list(params).then(r => r.data.data),
  })
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  () => client.get('/users').then(r => r.data.data),
  })

  const tasks = Array.isArray(data) ? data : []

  const create = useMutation({
    mutationFn: (d) => tasksApi.create(d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['task-counts'] }); setModal(false); setForm(EMPTY); toast.success('המשימה נוצרה') },
    onError:    (e) => setError(e.response?.data?.message ?? 'שגיאה ביצירה'),
  })
  const toggle = useMutation({
    mutationFn: ({ id, status }) => tasksApi.update(id, { status }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['task-counts'] }) },
  })
  const remove = useMutation({
    mutationFn: (id) => tasksApi.destroy(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['task-counts'] }); toast.success('המשימה נמחקה') },
  })

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    setError('')
    if (!form.title.trim()) return setError('כותרת המשימה חובה')
    create.mutate({
      ...form,
      assigned_to: form.assigned_to || user?.id,
      due_at:      form.due_at || undefined,
    })
  }

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">משימות</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">משימות ותזכורות מעקב</p>
        </div>
        {can('leads', 'can_create') && (
          <button onClick={() => { setForm(EMPTY); setError(''); setModal(true) }}
            className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm">
            <span className="text-lg leading-none">+</span> משימה חדשה
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 w-fit">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === f.id ? 'bg-white dark:bg-gray-800 text-[#2398c2] shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading && <div className="text-gray-400 dark:text-gray-500 text-sm">טוען...</div>}
        {!isLoading && tasks.length === 0 && (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <div className="text-4xl mb-3">✅</div>
            <div className="text-sm">אין משימות {filter === 'open' ? 'פתוחות' : filter === 'overdue' ? 'באיחור' : ''}</div>
          </div>
        )}
        {tasks.map(task => {
          const due  = fmtDue(task.due_at)
          const pri  = PRIORITY_META[task.priority] ?? PRIORITY_META.medium
          const done = task.status === 'done'
          return (
            <div key={task.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 shadow-sm flex items-start gap-3 group">
              <button onClick={() => toggle.mutate({ id: task.id, status: done ? 'open' : 'done' })}
                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  done ? 'bg-[#2398c2] border-[#2398c2] text-white' : 'border-gray-300 dark:border-gray-500 hover:border-[#2398c2]'
                }`}>
                {done && <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>

              <div className="flex-1 min-w-0">
                <div className={`font-medium text-sm ${done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                  {task.title}
                </div>
                {task.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{task.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
                  <span className={`inline-flex items-center gap-1 ${pri.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} />{pri.label}
                  </span>
                  {due && (
                    <span className={due.overdue && !done ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500'}>
                      🕐 {due.str}{due.overdue && !done ? ' · באיחור' : ''}
                    </span>
                  )}
                  {task.assigned_user && (
                    <span className="text-gray-400 dark:text-gray-500">👤 {task.assigned_user.name}</span>
                  )}
                </div>
              </div>

              {can('leads', 'can_update') && (
                <button onClick={() => { if (confirm('למחוק את המשימה?')) remove.mutate(task.id) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-600 hover:text-red-500 text-lg leading-none transition-opacity flex-shrink-0">×</button>
              )}
            </div>
          )
        })}
      </div>

      {/* Create modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={() => setModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">משימה חדשה</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={submit} className="px-6 py-4 space-y-3">
              {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <div>
                <label className={LABEL}>כותרת <span className="text-red-500">*</span></label>
                <input required value={form.title} onChange={set('title')} placeholder="לדוגמה: להתקשר ללקוח" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>תיאור</label>
                <textarea value={form.description} onChange={set('description')} rows={2} className={INPUT + ' resize-none'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>עדיפות</label>
                  <select value={form.priority} onChange={set('priority')} className={INPUT}>
                    <option value="low">נמוכה</option>
                    <option value="medium">בינונית</option>
                    <option value="high">גבוהה</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>תאריך יעד</label>
                  <input type="datetime-local" value={form.due_at} onChange={set('due_at')} className={INPUT} dir="ltr" />
                </div>
              </div>
              <div>
                <label className={LABEL}>הקצה לנציג</label>
                <select value={form.assigned_to} onChange={set('assigned_to')} className={INPUT}>
                  <option value="">אני ({user?.name})</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={create.isPending}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {create.isPending ? 'שומר...' : 'צור משימה'}
                </button>
                <button type="button" onClick={() => setModal(false)}
                  className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
