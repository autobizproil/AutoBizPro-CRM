import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { landingPagesApi } from '../../api/landingPages'
import LandingPagePreview from './LandingPagePreview'

/* ── uuid helper (no extra dep) ─────────────────────── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/* ── slug helper ─────────────────────────────────────── */
function slugify(title) {
  if (!title) return `page-${Date.now()}`
  const latin = title
    .replace(/[֐-׿]+/g, '') // strip Hebrew ranges
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  return latin || `page-${Date.now()}`
}

/* ── Default block props ─────────────────────────────── */
const BLOCK_DEFAULTS = {
  hero:  { heading: 'כותרת ראשית', subheading: 'תת כותרת', bg_color: '#4f46e5', text_color: '#ffffff' },
  text:  { heading: 'כותרת', body: 'תוכן הטקסט...' },
  image: { url: '', alt: '', caption: '' },
  cta:   { text: 'הצטרפו עכשיו', button_label: 'לחץ כאן', button_url: '', button_color: '#4f46e5' },
  form:  { title: 'צור קשר', fields: ['name', 'phone', 'email', 'message'], submit_label: 'שלח', success_message: 'תודה! נחזור אליך בקרוב.' },
}

const BLOCK_LABELS = {
  hero:  '+ Hero',
  text:  '+ טקסט',
  image: '+ תמונה',
  cta:   '+ CTA',
  form:  '+ טופס',
}

/* ── Block editor fields ─────────────────────────────── */
const FORM_FIELD_OPTIONS = [
  { key: 'name',    label: 'שם מלא' },
  { key: 'phone',   label: 'טלפון' },
  { key: 'email',   label: 'אימייל' },
  { key: 'message', label: 'הודעה' },
]

function BlockEditor({ block, onChange }) {
  const set = (key) => (e) => onChange({ ...block, [key]: e.target.value })

  if (block.type === 'hero') {
    return (
      <div className="space-y-3">
        <Field label="כותרת ראשית">
          <input className={inputCls} value={block.heading || ''} onChange={set('heading')} />
        </Field>
        <Field label="תת כותרת">
          <input className={inputCls} value={block.subheading || ''} onChange={set('subheading')} />
        </Field>
        <div className="flex gap-3">
          <Field label="צבע רקע">
            <input type="color" className="h-9 w-full rounded border border-gray-300 cursor-pointer"
              value={block.bg_color || '#4f46e5'} onChange={set('bg_color')} />
          </Field>
          <Field label="צבע טקסט">
            <input type="color" className="h-9 w-full rounded border border-gray-300 cursor-pointer"
              value={block.text_color || '#ffffff'} onChange={set('text_color')} />
          </Field>
        </div>
      </div>
    )
  }

  if (block.type === 'text') {
    return (
      <div className="space-y-3">
        <Field label="כותרת">
          <input className={inputCls} value={block.heading || ''} onChange={set('heading')} />
        </Field>
        <Field label="תוכן">
          <textarea className={`${inputCls} resize-none`} rows={5} value={block.body || ''} onChange={set('body')} />
        </Field>
      </div>
    )
  }

  if (block.type === 'image') {
    return (
      <div className="space-y-3">
        <Field label="כתובת תמונה (URL)">
          <input className={inputCls} placeholder="https://..." value={block.url || ''} onChange={set('url')} />
        </Field>
        <Field label="טקסט חלופי (alt)">
          <input className={inputCls} value={block.alt || ''} onChange={set('alt')} />
        </Field>
        <Field label="כיתוב">
          <input className={inputCls} value={block.caption || ''} onChange={set('caption')} />
        </Field>
      </div>
    )
  }

  if (block.type === 'cta') {
    return (
      <div className="space-y-3">
        <Field label="טקסט">
          <input className={inputCls} value={block.text || ''} onChange={set('text')} />
        </Field>
        <Field label="תווית כפתור">
          <input className={inputCls} value={block.button_label || ''} onChange={set('button_label')} />
        </Field>
        <Field label="קישור כפתור">
          <input className={inputCls} placeholder="https://..." value={block.button_url || ''} onChange={set('button_url')} />
        </Field>
        <Field label="צבע כפתור">
          <input type="color" className="h-9 w-full rounded border border-gray-300 cursor-pointer"
            value={block.button_color || '#4f46e5'} onChange={set('button_color')} />
        </Field>
      </div>
    )
  }

  if (block.type === 'form') {
    const toggleField = (key) => {
      const current = block.fields || []
      const next = current.includes(key)
        ? current.filter((f) => f !== key)
        : [...current, key]
      onChange({ ...block, fields: next })
    }
    return (
      <div className="space-y-3">
        <Field label="כותרת הטופס">
          <input className={inputCls} value={block.title || ''} onChange={set('title')} />
        </Field>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">שדות</label>
          <div className="space-y-1.5">
            {FORM_FIELD_OPTIONS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={(block.fields || []).includes(key)}
                  onChange={() => toggleField(key)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <Field label="תווית כפתור שליחה">
          <input className={inputCls} value={block.submit_label || ''} onChange={set('submit_label')} />
        </Field>
        <Field label="הודעת הצלחה">
          <input className={inputCls} value={block.success_message || ''} onChange={set('success_message')} />
        </Field>
      </div>
    )
  }

  return null
}

/* ── Small helpers ─────────────────────────────────────── */
const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

const BLOCK_TYPE_NAMES = {
  hero: 'Hero',
  text: 'טקסט',
  image: 'תמונה',
  cta: 'CTA',
  form: 'טופס',
}

/* ══════════════════════════════════════════════════════ */
/*  Main Editor component                                 */
/* ══════════════════════════════════════════════════════ */
export default function LandingPageEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isNew = !id

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [status, setStatus] = useState('draft')
  const [blocks, setBlocks] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  /* ── Load existing page ─────────────────────────────── */
  const { isLoading } = useQuery({
    queryKey: ['landing-page', id],
    queryFn: () => landingPagesApi.get(id).then((r) => r.data.data ?? r.data),
    enabled: !isNew,
    onSuccess: (page) => {
      setTitle(page.title || '')
      setSlug(page.slug || '')
      setStatus(page.status || 'draft')
      setBlocks(Array.isArray(page.blocks) ? page.blocks : [])
    },
  })

  /* ── Auto-generate slug from title ─────────────────── */
  const handleTitleChange = useCallback((val) => {
    setTitle(val)
    if (!slugTouched) setSlug(slugify(val))
  }, [slugTouched])

  /* ── Save mutation ─────────────────────────────────── */
  const saveMutation = useMutation({
    mutationFn: (payload) =>
      isNew
        ? landingPagesApi.create(payload)
        : landingPagesApi.update(id, payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['landing-pages'] })
      setSaveError('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      if (isNew) {
        const newId = res.data?.data?.id ?? res.data?.id
        if (newId) navigate(`/landing-pages/${newId}/edit`, { replace: true })
      }
    },
    onError: (e) => setSaveError(e.response?.data?.message ?? 'שגיאה בשמירה'),
  })

  const handleSave = () => {
    setSaveError('')
    if (!title.trim()) return setSaveError('כותרת הדף היא שדה חובה')
    saveMutation.mutate({ title, slug: slug || slugify(title), status, blocks })
  }

  /* ── Block operations ─────────────────────────────── */
  const addBlock = (type) => {
    const newBlock = { id: uid(), type, ...BLOCK_DEFAULTS[type] }
    setBlocks((prev) => [...prev, newBlock])
    setSelectedId(newBlock.id)
  }

  const updateBlock = (updated) => {
    setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
  }

  const deleteBlock = (blockId) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId))
    if (selectedId === blockId) setSelectedId(null)
  }

  const moveBlock = (blockId, dir) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId)
      if (idx < 0) return prev
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
  }

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null

  /* ── Preview ─────────────────────────────────────────── */
  const handlePreview = () => {
    const tenantSlug = window.location.hostname.split('.')[0]
    const pageSlug = slug || slugify(title)
    window.open(`/lp/${tenantSlug}/${pageSlug}`, '_blank')
  }

  if (!isNew && isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">טוען...</div>
  }

  return (
    <div dir="rtl" className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* ── Top bar ────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3 flex-shrink-0 shadow-sm">
        <button
          onClick={() => navigate('/landing-pages')}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-1"
          title="חזור לרשימה"
        >
          ←
        </button>

        <input
          type="text"
          placeholder="כותרת הדף"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        <input
          type="text"
          placeholder="slug (כתובת)"
          value={slug}
          onChange={(e) => { setSlugTouched(true); setSlug(e.target.value) }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
          dir="ltr"
        />

        {/* Status toggle */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs font-medium">
          <button
            onClick={() => setStatus('draft')}
            className={`px-3 py-1.5 transition-colors ${status === 'draft' ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            טיוטה
          </button>
          <button
            onClick={() => setStatus('published')}
            className={`px-3 py-1.5 transition-colors ${status === 'published' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            פורסם
          </button>
        </div>

        <div className="flex-1" />

        {saveError && (
          <span className="text-red-500 text-xs">{saveError}</span>
        )}
        {saved && (
          <span className="text-green-600 text-xs">נשמר ✓</span>
        )}

        <button
          onClick={handlePreview}
          className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          תצוגה מקדימה
        </button>

        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          {saveMutation.isPending ? 'שומר...' : 'שמור'}
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: palette + block list + editor ─ */}
        <div className="w-80 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">

          {/* Block palette */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">הוסף בלוק</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(BLOCK_LABELS).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => addBlock(type)}
                  className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2 py-1.5 font-medium transition-colors text-right"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Block list */}
          <div className="flex-1 overflow-y-auto">
            {blocks.length === 0 ? (
              <div className="px-4 py-6 text-xs text-gray-400 text-center">
                הוסף בלוק כדי להתחיל
              </div>
            ) : (
              <div className="px-3 py-3 space-y-1.5">
                {blocks.map((block, idx) => (
                  <div
                    key={block.id}
                    onClick={() => setSelectedId(block.id === selectedId ? null : block.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border transition-all ${
                      selectedId === block.id
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex-1 text-sm font-medium text-gray-700">
                      {BLOCK_TYPE_NAMES[block.type] || block.type}
                    </span>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveBlock(block.id, -1) }}
                        disabled={idx === 0}
                        className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 rounded"
                        title="הזז למעלה"
                      >
                        ▲
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 1) }}
                        disabled={idx === blocks.length - 1}
                        className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 rounded"
                        title="הזז למטה"
                      >
                        ▼
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteBlock(block.id) }}
                        className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 rounded"
                        title="מחק בלוק"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Inline block editor */}
            {selectedBlock && (
              <div className="mx-3 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
                  עריכת בלוק — {BLOCK_TYPE_NAMES[selectedBlock.type]}
                </p>
                <BlockEditor
                  key={selectedBlock.id}
                  block={selectedBlock}
                  onChange={updateBlock}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: live preview ─────────────── */}
        <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-96 max-w-4xl mx-auto">
            <LandingPagePreview blocks={blocks} />
          </div>
        </div>
      </div>
    </div>
  )
}
