import { useState } from 'react'
import { Plus, ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const PAGES = [
  { id: 1, name: 'קמפיין קיץ 2026',           slug: 'summer-2026',   views: 18420, conv: 892,  status: 'live',  pub: '12 במאי', tone: 'blue',  layout: 'hero'   },
  { id: 2, name: 'מבצע השקה — מוצר חדש',      slug: 'launch',        views: 9240,  conv: 512,  status: 'live',  pub: '2 במאי',  tone: 'lime',  layout: 'split'  },
  { id: 3, name: 'וובינר: אוטומציית מכירות', slug: 'webinar-sales', views: 6110,  conv: 418,  status: 'live',  pub: '28 באפר', tone: 'amber', layout: 'center' },
  { id: 4, name: 'הורדת מדריך חינם',          slug: 'free-guide',    views: 12880, conv: 1640, status: 'live',  pub: '15 באפר', tone: 'blue',  layout: 'split'  },
  { id: 5, name: 'דף תודה — לאחר הרשמה',     slug: 'thank-you',     views: 3210,  conv: 0,    status: 'live',  pub: '10 באפר', tone: 'green', layout: 'center' },
  { id: 6, name: 'קמפיין סתיו (טיוטה)',       slug: 'autumn-draft',  views: 0,     conv: 0,    status: 'draft', pub: '—',       tone: 'lime',  layout: 'hero'   },
]

const TONES = {
  blue:  { a: 'var(--brand-500)',           b: 'var(--brand-200)'  },
  lime:  { a: 'var(--lime-500,#9bcf24)',    b: 'var(--lime-200,#dcf09b)' },
  amber: { a: 'var(--amber-500,#f59e0b)',   b: '#fde68a'           },
  green: { a: 'var(--green-500,#22c55e)',   b: '#bbf7d0'           },
}

function Thumb({ tone, layout }) {
  const t = TONES[tone] || TONES.blue
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
      {/* Browser chrome */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '5px 8px', display: 'flex', gap: 4 }}>
        {['#ef4444','#f59e0b','#22c55e'].map(c => <span key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />)}
      </div>
      {/* Layout sketch */}
      <div style={{ padding: 10, background: t.b + '22', minHeight: 90 }}>
        {layout === 'hero' && (
          <>
            <div style={{ height: 40, borderRadius: 4, background: t.a + '33', marginBottom: 6 }} />
            <div style={{ height: 6, borderRadius: 3, background: t.a + '55', width: '60%', marginBottom: 4 }} />
            <div style={{ height: 6, borderRadius: 3, background: t.a + '33', width: '40%', marginBottom: 8 }} />
            <div style={{ height: 20, borderRadius: 4, background: t.a, width: '35%' }} />
          </>
        )}
        {layout === 'split' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ height: 6, borderRadius: 3, background: t.a + '55', width: '80%', marginBottom: 4 }} />
              <div style={{ height: 6, borderRadius: 3, background: t.a + '33', width: '55%', marginBottom: 8 }} />
              <div style={{ height: 18, borderRadius: 4, background: t.a, width: '50%' }} />
            </div>
            <div style={{ flex: 1, borderRadius: 4, background: t.a + '44' }} />
          </div>
        )}
        {layout === 'center' && (
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <div style={{ height: 12, width: 40, borderRadius: 999, background: t.a + '55', margin: '0 auto 6px' }} />
            <div style={{ height: 6, borderRadius: 3, background: t.a + '55', width: '66%', margin: '0 auto 4px' }} />
            <div style={{ height: 6, borderRadius: 3, background: t.a + '33', width: '48%', margin: '0 auto 8px' }} />
            <div style={{ height: 18, borderRadius: 4, background: t.a, width: 70, margin: '0 auto' }} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function LandingPage() {
  const { can } = useAuth()
  const [tab, setTab] = useState('all')
  const [pages, setPages] = useState(PAGES)

  const tabs = [
    { k: 'all',   label: 'הכל',      n: pages.length },
    { k: 'live',  label: 'מפורסמים', n: pages.filter(p => p.status === 'live').length },
    { k: 'draft', label: 'טיוטות',   n: pages.filter(p => p.status === 'draft').length },
  ]

  const visible = tab === 'all' ? pages : pages.filter(p => p.status === tab)

  const removePage = (id) => setPages(ps => ps.filter(p => p.id !== id))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {tabs.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              border: 'none', background: tab === t.k ? 'var(--brand-50)' : 'none',
              color: tab === t.k ? 'var(--brand-600)' : 'var(--text-subtle)',
              fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
              padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}>
              {t.label}
              <span style={{
                fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '1px 7px',
                background: tab === t.k ? 'var(--brand-600)' : 'var(--surface-2)',
                color: tab === t.k ? '#fff' : 'var(--text-subtle)',
              }}>{t.n}</span>
            </button>
          ))}
        </div>
        {can('forms', 'can_create') && (
          <button className="btn btn--accent btn--sm"><Plus size={14} />דף נחיתה חדש</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
        {visible.map(p => (
          <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 14px 10px' }}>
              <Thumb tone={p.tone} layout={p.layout} />
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                <span className={`pill pill--${p.status === 'live' ? 'won' : 'talk'}`} style={{ flexShrink: 0 }}>
                  <span className="dot" />{p.status === 'live' ? 'פעיל' : 'טיוטה'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 10 }} dir="ltr">
                /{p.slug} · פורסם {p.pub}
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-subtle)', marginBottom: 12 }}>
                <span><b style={{ color: 'var(--text)', fontWeight: 700 }}>{p.views.toLocaleString('en-US')}</b> צפיות</span>
                <span><b style={{ color: 'var(--text)', fontWeight: 700 }}>{p.conv.toLocaleString('en-US')}</b> המרות</span>
                <span><b style={{ color: 'var(--brand-600)', fontWeight: 700 }}>
                  {p.views ? Math.round((p.conv / p.views) * 100) : 0}%
                </b> שיעור המרה</span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn--outline btn--sm" style={{ flex: 1 }}>ערוך</button>
                <button className="btn btn--ghost btn--icon btn--sm"
                  onClick={() => window.open(`/${p.slug}`, '_blank')}>
                  <ExternalLink size={14} />
                </button>
                <button className="btn btn--ghost btn--icon btn--sm"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => removePage(p.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* New page tile */}
        {can('forms', 'can_create') && (
          <div style={{
            borderRadius: 10, border: '2px dashed var(--border)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280,
            color: 'var(--text-subtle)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <Plus size={24} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>צור דף נחיתה חדש</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
