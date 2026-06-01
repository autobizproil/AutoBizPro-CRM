/**
 * LandingPagePreview
 * Renders a landing page's blocks as styled HTML.
 * Used in the editor preview panel AND in the public viewer.
 */
export default function LandingPagePreview({ blocks = [], onSubmit, submitting, submitted }) {
  if (!blocks.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <div className="text-4xl mb-3">🌐</div>
        <p className="text-sm">אין בלוקים עדיין — הוסף בלוק מהלוח</p>
      </div>
    )
  }

  return (
    <div dir="rtl" className="w-full font-sans">
      {blocks.map((block) => (
        <BlockRenderer
          key={block.id}
          block={block}
          onSubmit={onSubmit}
          submitting={submitting}
          submitted={submitted}
        />
      ))}
    </div>
  )
}

function BlockRenderer({ block, onSubmit, submitting, submitted }) {
  switch (block.type) {
    case 'hero':  return <HeroBlock block={block} />
    case 'text':  return <TextBlock block={block} />
    case 'image': return <ImageBlock block={block} />
    case 'cta':   return <CtaBlock block={block} />
    case 'form':  return <FormBlock block={block} onSubmit={onSubmit} submitting={submitting} submitted={submitted} />
    default:      return null
  }
}

/* ── Hero ─────────────────────────────────────────────── */
function HeroBlock({ block }) {
  const bg   = block.bg_color   || '#4f46e5'
  const text = block.text_color || '#ffffff'
  return (
    <div
      className="w-full py-20 px-6 text-center"
      style={{ backgroundColor: bg, color: text }}
    >
      {block.heading && (
        <h1 className="text-4xl font-bold mb-4 leading-tight">{block.heading}</h1>
      )}
      {block.subheading && (
        <p className="text-xl opacity-90 max-w-2xl mx-auto">{block.subheading}</p>
      )}
    </div>
  )
}

/* ── Text ─────────────────────────────────────────────── */
function TextBlock({ block }) {
  return (
    <div className="bg-white py-12 px-6">
      <div className="max-w-3xl mx-auto">
        {block.heading && (
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{block.heading}</h2>
        )}
        {block.body && (
          <p className="text-gray-600 leading-relaxed whitespace-pre-line">{block.body}</p>
        )}
      </div>
    </div>
  )
}

/* ── Image ────────────────────────────────────────────── */
function ImageBlock({ block }) {
  if (!block.url) return null
  return (
    <div className="bg-white py-10 px-6 text-center">
      <div className="max-w-3xl mx-auto">
        <img
          src={block.url}
          alt={block.alt || ''}
          className="mx-auto max-w-full rounded-xl shadow-md"
        />
        {block.caption && (
          <p className="mt-3 text-sm text-gray-500">{block.caption}</p>
        )}
      </div>
    </div>
  )
}

/* ── CTA ──────────────────────────────────────────────── */
function CtaBlock({ block }) {
  const btnColor = block.button_color || '#4f46e5'
  return (
    <div className="bg-gray-50 py-16 px-6 text-center">
      <div className="max-w-2xl mx-auto">
        {block.text && (
          <p className="text-xl text-gray-800 mb-6 font-medium">{block.text}</p>
        )}
        {block.button_label && (
          <a
            href={block.button_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-8 py-3 rounded-xl text-white font-semibold text-base shadow-md hover:opacity-90 transition-opacity"
            style={{ backgroundColor: btnColor }}
          >
            {block.button_label}
          </a>
        )}
      </div>
    </div>
  )
}

/* ── Form ─────────────────────────────────────────────── */
const FORM_FIELD_LABELS = {
  name:    'שם מלא',
  phone:   'טלפון',
  email:   'אימייל',
  message: 'הודעה',
}

function FormBlock({ block, onSubmit, submitting, submitted }) {
  const activeFields = (block.fields || []).filter(Boolean)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!onSubmit) return
    const formData = {}
    const fd = new FormData(e.target)
    fd.forEach((val, key) => { formData[key] = val })
    onSubmit(formData)
  }

  if (submitted) {
    return (
      <div className="bg-white py-12 px-6">
        <div className="max-w-lg mx-auto bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-green-700 font-medium">
            {block.success_message || 'תודה! פנייתך נשלחה בהצלחה.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white py-12 px-6">
      <div className="max-w-lg mx-auto bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
        {block.title && (
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">{block.title}</h2>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {activeFields.map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {FORM_FIELD_LABELS[field] || field}
              </label>
              {field === 'message' ? (
                <textarea
                  name={field}
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              ) : (
                <input
                  name={field}
                  type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              )}
            </div>
          ))}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold mt-2 transition-colors"
          >
            {submitting ? 'שולח...' : (block.submit_label || 'שלח')}
          </button>
        </form>
      </div>
    </div>
  )
}
