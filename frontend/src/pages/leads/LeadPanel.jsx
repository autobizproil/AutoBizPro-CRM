import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLead, useLeadActivities, useUpdateLead, useAddLeadActivity } from '../../hooks/useLeads'
import { useWhatsappTemplates } from '../../hooks/useWhatsapp'
import { renderTemplate, waLink } from '../../api/whatsapp'
import { integrationsApi, GI_DOC_TYPES } from '../../api/integrations'
import { customFieldsApi } from '../../api/customFields'
import { clientsApi } from '../../api/clients'
import { tasksApi } from '../../api/tasks'
import { useToast } from '../../context/ToastContext'

const ACTIVITY_TYPES = {
  call:         { label: 'שיחה',  icon: '📞', color: '#3b82f6' },
  whatsapp:     { label: 'וואטסאפ', icon: '💬', color: '#22c55e' },
  email:        { label: 'אימייל', icon: '✉️', color: '#a855f7' },
  meeting:      { label: 'פגישה', icon: '🤝', color: '#f59e0b' },
  note:         { label: 'הערה',  icon: '📝', color: '#6b7280' },
  task:         { label: 'משימה', icon: '✅', color: '#0ea5e9' },
  stage_change: { label: 'שינוי שלב', icon: '🔀', color: '#2398c2' },
}

function timeAgo(iso) {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'הרגע'
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק'`
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע'`
  return d.toLocaleDateString('he-IL')
}

export default function LeadPanel({ leadId, stages = [], onClose, canEdit }) {
  const { data: lead, isLoading }   = useLead(leadId)
  const { data: activities = [] }   = useLeadActivities(leadId)
  const updateLead                  = useUpdateLead()
  const addActivity                 = useAddLeadActivity()
  const { data: templates = [] }    = useWhatsappTemplates()
  const qc                          = useQueryClient()
  const toast                       = useToast()

  const [edit, setEdit]       = useState({})
  const [cfValues, setCfValues] = useState({})

  const { data: cfData } = useQuery({
    queryKey: ['custom-fields'],
    queryFn:  () => customFieldsApi.list().then(r => r.data.data),
    staleTime: 1000 * 60 * 5,
  })
  const [activityType, setAT] = useState('call')
  const [activityBody, setAB] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [invType, setInvType] = useState(400)
  const [invItems, setInvItems] = useState([{ description: '', price: '', quantity: 1 }])
  const [invTaxId, setInvTaxId] = useState('')

  // --- Cardcom modal state ---
  const [showCardcom, setShowCardcom]         = useState(false)
  const [cardcomAmount, setCardcomAmount]     = useState('')
  const [cardcomDesc, setCardcomDesc]         = useState('')

  // --- Yesh Invoice modal state ---
  const [showYesh, setShowYesh]               = useState(false)
  const [yeshType, setYeshType]               = useState(400)
  const [yeshItems, setYeshItems]             = useState([{ description: '', price: '', quantity: 1 }])
  const [yeshTaxId, setYeshTaxId]             = useState('')

  // --- PDF modal state ---
  const [showPdf, setShowPdf]                 = useState(false)
  const [pdfSignUrl, setPdfSignUrl]           = useState('')

  // --- Task modal state ---
  const [showTask, setShowTask]               = useState(false)
  const [taskTitle, setTaskTitle]             = useState('')
  const [taskDue, setTaskDue]                 = useState('')
  const [taskPriority, setTaskPriority]       = useState('medium')

  const createTask = useMutation({
    mutationFn: () => tasksApi.create({
      title: taskTitle, due_at: taskDue || undefined, priority: taskPriority,
      related_type: 'lead', related_id: leadId,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-counts'] })
      setShowTask(false); setTaskTitle(''); setTaskDue(''); setTaskPriority('medium')
      toast.success('המשימה נוצרה')
    },
    onError: () => toast.error('שגיאה ביצירת המשימה'),
  })

  const createInvoice = useMutation({
    mutationFn: (payload) => integrationsApi.greenInvoiceCreate(leadId, payload).then(r => r.data),
  })

  const cardcomCreatePage = useMutation({
    mutationFn: (payload) => integrationsApi.cardcomCreatePage(leadId, payload).then(r => r.data),
    onSuccess: (data) => {
      if (data?.success && data?.data?.url) window.open(data.data.url, '_blank')
    },
  })

  const yeshCreateInvoice = useMutation({
    mutationFn: (payload) => integrationsApi.yeshInvoiceCreate(leadId, payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-activities', leadId] })
    },
  })

  const pdfCreateToken = useMutation({
    mutationFn: () => integrationsApi.pdfCreateToken(leadId).then(r => r.data),
    onSuccess: (data) => {
      if (data?.url) setPdfSignUrl(data.url)
    },
  })

  // Reset local edit state when switching leads
  useEffect(() => {
    setEdit({}); setAB(''); setShowTemplates(false)
    setShowInvoice(false); setInvItems([{ description: '', price: '', quantity: 1 }]); setInvTaxId('')
    setShowCardcom(false); setCardcomAmount(''); setCardcomDesc('')
    setShowYesh(false); setYeshItems([{ description: '', price: '', quantity: 1 }]); setYeshTaxId('')
    setShowPdf(false); setPdfSignUrl('')
    createInvoice.reset()
    cardcomCreatePage.reset()
    yeshCreateInvoice.reset()
    pdfCreateToken.reset()
  }, [leadId])

  useEffect(() => {
    if (lead?.custom_fields) setCfValues(lead.custom_fields)
  }, [lead?.custom_fields])

  if (!leadId) return null

  const field = (key) => edit[key] !== undefined ? edit[key] : (lead?.[key] ?? '')
  const setField = (key) => (e) => setEdit(s => ({ ...s, [key]: e.target.value }))
  const commit = (key) => {
    if (edit[key] === undefined || edit[key] === (lead?.[key] ?? '')) return
    updateLead.mutate({ id: leadId, data: { [key]: edit[key] } })
  }

  const changeStage = (e) => updateLead.mutate({ id: leadId, data: { pipeline_stage_id: Number(e.target.value) } })

  const submitActivity = (e) => {
    e.preventDefault()
    if (!activityBody.trim()) return
    addActivity.mutate({ leadId, data: { type: activityType, body: activityBody } })
    setAB('')
  }

  const sendWhatsapp = (template) => {
    const msg = template ? renderTemplate(template.body, { name: lead.name }) : ''
    window.open(waLink(lead?.phone, msg), '_blank')
    // log it
    addActivity.mutate({ leadId, data: { type: 'whatsapp', body: msg || 'נשלחה הודעת וואטסאפ' } })
    setShowTemplates(false)
  }

  const invTotal = invItems.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0)
  const setItem = (i, key) => (e) => setInvItems(items => items.map((it, idx) => idx === i ? { ...it, [key]: e.target.value } : it))
  const addItem = () => setInvItems(items => [...items, { description: '', price: '', quantity: 1 }])
  const removeItem = (i) => setInvItems(items => items.filter((_, idx) => idx !== i))

  const submitInvoice = async (e) => {
    e.preventDefault()
    const items = invItems
      .filter(it => it.description.trim() && Number(it.price) > 0)
      .map(it => ({ description: it.description, price: Number(it.price), quantity: Number(it.quantity) || 1 }))
    if (!items.length) return
    const res = await createInvoice.mutateAsync({ type: invType, items, tax_id: invTaxId || undefined })
    if (res?.success && res.data?.url) window.open(res.data.url, '_blank')
  }

  // Cardcom helpers
  const submitCardcom = async (e) => {
    e.preventDefault()
    if (!cardcomAmount || Number(cardcomAmount) < 1) return
    cardcomCreatePage.mutate({ amount: Number(cardcomAmount), description: cardcomDesc })
  }

  // Yesh Invoice helpers
  const yeshTotal = yeshItems.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0)
  const setYeshItem = (i, key) => (e) => setYeshItems(items => items.map((it, idx) => idx === i ? { ...it, [key]: e.target.value } : it))
  const addYeshItem = () => setYeshItems(items => [...items, { description: '', price: '', quantity: 1 }])
  const removeYeshItem = (i) => setYeshItems(items => items.filter((_, idx) => idx !== i))

  const submitYesh = async (e) => {
    e.preventDefault()
    const items = yeshItems
      .filter(it => it.description.trim() && Number(it.price) > 0)
      .map(it => ({ description: it.description, price: Number(it.price), quantity: Number(it.quantity) || 1 }))
    if (!items.length) return
    await yeshCreateInvoice.mutateAsync({ type: yeshType, items, tax_id: yeshTaxId || undefined })
  }

  // PDF helpers
  const handlePdfSign = () => {
    setPdfSignUrl('')
    pdfCreateToken.reset()
    setShowPdf(true)
    pdfCreateToken.mutate()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 left-0 h-full w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col" dir="rtl">
        {isLoading || !lead ? (
          <div className="flex items-center justify-center h-full text-gray-400">טוען...</div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-start justify-between"
              style={{ borderTop: `4px solid ${lead.stage?.color ?? '#2398c2'}` }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold flex-shrink-0"
                  style={{ backgroundColor: lead.stage?.color ?? '#2398c2' }}>
                  {lead.name?.trim()
                    ? lead.name.trim()[0].toUpperCase()
                    : <svg className="w-5 h-5 opacity-80" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                  }
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg truncate">{lead.name}</h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500">נוצר {new Date(lead.created_at).toLocaleDateString('he-IL')}</p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>

            {/* Quick actions */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex gap-2 flex-wrap">
              {lead.phone && (
                <a href={`tel:${lead.phone}`}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-lg text-sm font-medium transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> התקשר
                </a>
              )}
              {lead.phone && (
                <div className="flex-1 relative">
                  <button onClick={() => setShowTemplates(s => !s)}
                    className="w-full flex items-center justify-center gap-1.5 bg-green-50 hover:bg-green-100 text-green-700 py-2 rounded-lg text-sm font-medium transition-colors">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> וואטסאפ
                  </button>
                  {showTemplates && (
                    <div className="absolute top-full mt-1 right-0 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 py-1 max-h-56 overflow-y-auto">
                      <button onClick={() => sendWhatsapp(null)}
                        className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">הודעה ריקה</button>
                      {templates.map(t => (
                        <button key={t.id} onClick={() => sendWhatsapp(t)}
                          className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-50 dark:border-gray-700">
                          <div className="font-medium text-gray-800 dark:text-gray-200">{t.name}</div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{t.body}</div>
                        </button>
                      ))}
                      {templates.length === 0 && <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">אין תבניות — הוסף בהגדרות</div>}
                    </div>
                  )}
                </div>
              )}
              {canEdit && (
                <button onClick={() => setShowInvoice(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 py-2 rounded-lg text-sm font-medium transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> חשבונית
                </button>
              )}
              {canEdit && lead?.name && (
                <button onClick={() => { setShowCardcom(true); cardcomCreatePage.reset() }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 py-2 rounded-lg text-sm font-medium transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> תשלום
                </button>
              )}
              {canEdit && (
                <button onClick={() => { setShowYesh(true); yeshCreateInvoice.reset() }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 py-2 rounded-lg text-sm font-medium transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Yesh
                </button>
              )}
              {canEdit && (
                <button onClick={handlePdfSign}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 py-2 rounded-lg text-sm font-medium transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> חתימה
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => clientsApi.convertLead(lead.id).then(() => toast.success('הליד הומר ללקוח!')).catch(() => toast.error('שגיאה בהמרה'))}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#2398c2]/10 hover:bg-[#2398c2]/20 text-[#2398c2] py-2 rounded-lg text-sm font-medium transition-colors"
                  title="המר ללקוח">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg> לקוח
                </button>
              )}
              {canEdit && (
                <button onClick={() => setShowTask(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-900/30 dark:hover:bg-sky-900/50 text-sky-700 dark:text-sky-300 py-2 rounded-lg text-sm font-medium transition-colors"
                  title="צור משימת מעקב">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> משימה
                </button>
              )}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Details */}
              <div className="px-5 py-4 space-y-3 border-b border-gray-100 dark:border-gray-700">
                <Detail label="סטטוס">
                  <select value={lead.pipeline_stage_id ?? ''} onChange={changeStage} disabled={!canEdit}
                    className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-60">
                    <option value="">ללא שלב</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Detail>
                <EditableDetail label="טלפון" value={field('phone')} onChange={setField('phone')} onBlur={() => commit('phone')} disabled={!canEdit} type="tel" />
                <EditableDetail label="אימייל" value={field('email')} onChange={setField('email')} onBlur={() => commit('email')} disabled={!canEdit} type="email" />
                <EditableDetail label="מקור" value={field('source')} onChange={setField('source')} onBlur={() => commit('source')} disabled={!canEdit} />
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">הערות</label>
                  <textarea value={field('notes')} onChange={setField('notes')} onBlur={() => commit('notes')} disabled={!canEdit} rows={2}
                    className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1.5 text-sm resize-none disabled:opacity-60" placeholder="הוסף הערה..." />
                </div>

                {/* Custom fields */}
                {(cfData?.custom ?? []).map(cf => (
                  <CustomFieldInput
                    key={cf.id}
                    field={cf}
                    value={cfValues[cf.name] ?? ''}
                    disabled={!canEdit}
                    onChange={val => setCfValues(prev => ({ ...prev, [cf.name]: val }))}
                    onBlur={() => {
                      updateLead.mutate({ id: lead.id, data: { custom_fields: { ...(lead.custom_fields ?? {}), ...cfValues, [cf.name]: cfValues[cf.name] ?? '' } } })
                    }}
                  />
                ))}
              </div>

              {/* Activity composer */}
              {canEdit && (
                <form onSubmit={submitActivity} className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-2">תיעוד פעילות</label>
                  <div className="flex gap-2 mb-2">
                    <select value={activityType} onChange={e => setAT(e.target.value)}
                      className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                      {['call','whatsapp','email','meeting','note','task'].map(t =>
                        <option key={t} value={t}>{ACTIVITY_TYPES[t].icon} {ACTIVITY_TYPES[t].label}</option>)}
                    </select>
                    <input value={activityBody} onChange={e => setAB(e.target.value)} placeholder="מה קרה?"
                      className="flex-1 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <button type="submit" disabled={!activityBody.trim() || addActivity.isPending}
                    className="bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-sm font-medium w-full">
                    {addActivity.isPending ? 'שומר...' : 'הוסף לתיעוד'}
                  </button>
                </form>
              )}

              {/* Timeline */}
              <div className="px-5 py-4">
                <h3 className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-3">ציר זמן ({activities.length})</h3>
                {activities.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">אין פעילות עדיין</p>
                ) : (
                  <div className="space-y-3">
                    {activities.map(a => {
                      const meta = ACTIVITY_TYPES[a.type] ?? ACTIVITY_TYPES.note
                      return (
                        <div key={a.id} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                            style={{ backgroundColor: meta.color + '22' }}>{meta.icon}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{meta.label}</span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(a.created_at)}</span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 break-words">{a.body}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Green Invoice modal */}
      {showInvoice && lead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" dir="rtl" onClick={() => setShowInvoice(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">🧾 הפקת מסמך — {lead.name}</h2>
              <button onClick={() => setShowInvoice(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={submitInvoice} className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {createInvoice.isError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                  {createInvoice.error?.response?.data?.message ?? 'שגיאה בהפקת המסמך — בדוק חיבור Green Invoice בהגדרות'}
                </div>
              )}
              {createInvoice.data?.success && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg">
                  ✓ הופק מסמך #{createInvoice.data.data.document_id}
                  {createInvoice.data.data.url && <> — <a href={createInvoice.data.data.url} target="_blank" rel="noreferrer" className="underline">הורד PDF</a></>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג מסמך</label>
                  <select value={invType} onChange={e => setInvType(Number(e.target.value))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    {GI_DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ח.פ / ת.ז (אופציונלי)</label>
                  <input value={invTaxId} onChange={e => setInvTaxId(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" placeholder="—" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">פריטים</label>
                <div className="space-y-2">
                  {invItems.map((it, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={it.description} onChange={setItem(i, 'description')} placeholder="תיאור"
                        className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      <input value={it.price} onChange={setItem(i, 'price')} type="number" step="0.01" placeholder="מחיר"
                        className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      <input value={it.quantity} onChange={setItem(i, 'quantity')} type="number" placeholder="כמות"
                        className="w-16 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      {invItems.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addItem} className="mt-2 text-[#2398c2] hover:text-[#1d7fa3] text-sm font-medium">+ הוסף פריט</button>
              </div>
              <div className="text-left text-sm font-semibold text-gray-700">סה"כ: ₪{invTotal.toLocaleString('he-IL')}</div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={createInvoice.isPending || invTotal <= 0}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {createInvoice.isPending ? 'מפיק...' : 'הפק מסמך'}
                </button>
                <button type="button" onClick={() => setShowInvoice(false)} className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm dark:text-gray-300">סגור</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cardcom payment modal */}
      {showCardcom && lead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" dir="rtl" onClick={() => setShowCardcom(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">💳 שליחת עמוד תשלום — {lead.name}</h2>
              <button onClick={() => setShowCardcom(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={submitCardcom} className="px-6 py-4 space-y-4">
              {cardcomCreatePage.isError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                  {cardcomCreatePage.error?.response?.data?.message ?? 'שגיאה ביצירת עמוד התשלום — בדוק הגדרות Cardcom'}
                </div>
              )}
              {cardcomCreatePage.data?.success && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg">
                  ✓ עמוד תשלום נוצר בהצלחה — הקישור נפתח בחלון חדש
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סכום לתשלום (₪)</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={cardcomAmount}
                  onChange={e => setCardcomAmount(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="הכנס סכום..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תיאור</label>
                <input
                  type="text"
                  value={cardcomDesc}
                  onChange={e => setCardcomDesc(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="תיאור העסקה..."
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={cardcomCreatePage.isPending || !cardcomAmount || Number(cardcomAmount) < 1}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {cardcomCreatePage.isPending ? 'יוצר...' : 'צור עמוד תשלום'}
                </button>
                <button type="button" onClick={() => setShowCardcom(false)} className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm dark:text-gray-300">סגור</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Yesh Invoice modal */}
      {showYesh && lead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" dir="rtl" onClick={() => setShowYesh(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">🧾 Yesh Invoice — {lead.name}</h2>
              <button onClick={() => setShowYesh(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={submitYesh} className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {yeshCreateInvoice.isError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                  {yeshCreateInvoice.error?.response?.data?.message ?? 'שגיאה בהפקת המסמך — בדוק חיבור Yesh Invoice בהגדרות'}
                </div>
              )}
              {yeshCreateInvoice.data?.success && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg">
                  ✓ הופק מסמך בהצלחה
                  {yeshCreateInvoice.data?.data?.url && (
                    <> — <a href={yeshCreateInvoice.data.data.url} target="_blank" rel="noreferrer" className="underline">הורד PDF</a></>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג מסמך</label>
                  <select value={yeshType} onChange={e => setYeshType(Number(e.target.value))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    {GI_DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ח.פ / ת.ז (אופציונלי)</label>
                  <input value={yeshTaxId} onChange={e => setYeshTaxId(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" placeholder="—" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">פריטים</label>
                <div className="space-y-2">
                  {yeshItems.map((it, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={it.description} onChange={setYeshItem(i, 'description')} placeholder="תיאור"
                        className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      <input value={it.price} onChange={setYeshItem(i, 'price')} type="number" step="0.01" placeholder="מחיר"
                        className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      <input value={it.quantity} onChange={setYeshItem(i, 'quantity')} type="number" placeholder="כמות"
                        className="w-16 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      {yeshItems.length > 1 && (
                        <button type="button" onClick={() => removeYeshItem(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addYeshItem} className="mt-2 text-[#2398c2] hover:text-[#1d7fa3] text-sm font-medium">+ הוסף פריט</button>
              </div>
              <div className="text-left text-sm font-semibold text-gray-700">סה"כ: ₪{yeshTotal.toLocaleString('he-IL')}</div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={yeshCreateInvoice.isPending || yeshTotal <= 0}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {yeshCreateInvoice.isPending ? 'מפיק...' : 'הפק מסמך'}
                </button>
                <button type="button" onClick={() => setShowYesh(false)} className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm dark:text-gray-300">סגור</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Signature modal */}
      {showPdf && lead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" dir="rtl" onClick={() => setShowPdf(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">✍️ חתימה דיגיטלית — {lead.name}</h2>
              <button onClick={() => setShowPdf(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {pdfCreateToken.isPending && (
                <div className="text-sm text-gray-500 text-center py-4">יוצר קישור לחתימה...</div>
              )}
              {pdfCreateToken.isError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                  {pdfCreateToken.error?.response?.data?.message ?? 'שגיאה ביצירת קישור לחתימה — בדוק הגדרות PDF'}
                </div>
              )}
              {pdfSignUrl && (
                <>
                  <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg">
                    ✓ קישור לחתימה נוצר בהצלחה
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">קישור לחתימה</label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={pdfSignUrl}
                        className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 select-all"
                        onClick={e => e.target.select()}
                      />
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(pdfSignUrl)}
                        className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
                      >
                        העתק קישור
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open(pdfSignUrl, '_blank')}
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-lg text-sm font-medium"
                  >
                    פתח לחתימה
                  </button>
                </>
              )}
              <button type="button" onClick={() => setShowPdf(false)} className="w-full px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm dark:text-gray-300">סגור</button>
            </div>
          </div>
        </div>
      )}

      {/* Task modal */}
      {showTask && lead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" dir="rtl" onClick={() => setShowTask(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">✅ משימת מעקב — {lead.name}</h2>
              <button onClick={() => setShowTask(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); if (taskTitle.trim()) createTask.mutate() }} className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כותרת <span className="text-red-500">*</span></label>
                <input autoFocus required value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="לדוגמה: לחזור ללקוח"
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">עדיפות</label>
                  <select value={taskPriority} onChange={e => setTaskPriority(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm">
                    <option value="low">נמוכה</option>
                    <option value="medium">בינונית</option>
                    <option value="high">גבוהה</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תאריך יעד</label>
                  <input type="datetime-local" value={taskDue} onChange={e => setTaskDue(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={createTask.isPending || !taskTitle.trim()}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {createTask.isPending ? 'שומר...' : 'צור משימה'}
                </button>
                <button type="button" onClick={() => setShowTask(false)} className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function Detail({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      {children}
    </div>
  )
}

function EditableDetail({ label, value, onChange, onBlur, disabled, type = 'text' }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
      <input type={type} value={value} onChange={onChange} onBlur={onBlur} disabled={disabled}
        className="text-sm text-gray-800 dark:text-gray-200 text-left border border-transparent hover:border-gray-200 dark:hover:border-gray-600 focus:border-[#2398c2]/50 rounded px-2 py-1 w-44 focus:outline-none disabled:opacity-60 bg-transparent"
        placeholder="—" />
    </div>
  )
}

function CustomFieldInput({ field, value, onChange, onBlur, disabled }) {
  const INPUT_CLS = 'text-sm text-gray-800 dark:text-gray-200 text-left border border-transparent hover:border-gray-200 dark:hover:border-gray-600 focus:border-[#2398c2]/50 rounded px-2 py-1 w-44 focus:outline-none disabled:opacity-60 bg-transparent'

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">{field.label}</span>
      {field.field_type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} disabled={disabled}
          className={INPUT_CLS + ' bg-white dark:bg-gray-700'}>
          <option value="">—</option>
          {(field.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : field.field_type === 'checkbox' ? (
        <input type="checkbox" checked={!!value} disabled={disabled}
          onChange={e => { onChange(e.target.checked); onBlur() }}
          className="rounded border-gray-300 accent-[#2398c2]" />
      ) : field.field_type === 'textarea' ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} disabled={disabled} rows={2}
          className="text-sm text-gray-800 dark:text-gray-200 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 focus:border-[#2398c2]/50 rounded px-2 py-1 w-44 resize-none focus:outline-none disabled:opacity-60 bg-transparent"
          placeholder="—" />
      ) : (
        <input
          type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : field.field_type === 'url' ? 'url' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          className={INPUT_CLS}
          placeholder="—"
        />
      )}
    </div>
  )
}
