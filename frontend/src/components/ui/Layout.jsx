import { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { usePreferences } from '../../context/PreferencesContext'
import { translations } from '../../i18n/translations'
import { tasksApi } from '../../api/tasks'
import { settingsApi } from '../../api/settings'
import { recordTypesApi } from '../../api/recordTypes'

// Top-level, always visible — keep this to ~5 so the bar never overflows.
const PRIMARY_NAV = [
  { to: '/leads',        labelKey: 'leads'        },
  { to: '/clients',      labelKey: 'clients'      },
  { to: '/contacts',     labelKey: 'contacts'     },
  { to: '/tasks',        labelKey: 'tasks', badge: 'tasks' },
  { to: '/reports',      labelKey: 'reports'      },
]

// Everything else lives behind the "עוד" dropdown.
const MORE_NAV = [
  { to: '/dashboard',    labelKey: 'dashboard'    },
  { to: '/pipeline',     labelKey: 'pipeline'     },
  { to: '/automations',  labelKey: 'automations'  },
  { to: '/forms',        labelKey: 'forms'        },
  { to: '/landing-pages',labelKey: 'landingPages' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { lang } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  const tr = (key) => translations[lang]?.[key] ?? key

  const [showMore, setShowMore] = useState(false)
  const moreRef = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  useEffect(() => { setShowMore(false) }, [location.pathname])

  const { data: taskCounts } = useQuery({
    queryKey: ['task-counts'],
    queryFn:  () => tasksApi.counts().then(r => r.data.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const badges = { tasks: taskCounts?.open ?? 0 }

  const { data: tenant } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn:  () => settingsApi.getTenant().then(r => r.data.data),
    staleTime: 1000 * 60 * 5,
  })
  const logo = tenant?.settings?.logo

  const { data: recordTypes = [] } = useQuery({
    queryKey: ['record-types'],
    queryFn:  () => recordTypesApi.list().then(r => r.data.data),
    staleTime: 1000 * 60 * 5,
  })
  const customNav = recordTypes.map(rt => ({ to: `/records/${rt.slug}`, label: rt.label, icon: rt.icon }))

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900" dir={lang === 'he' ? 'rtl' : 'ltr'}>

      {/* Top navigation bar — Fireberry-style */}
      <header className="h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-4 flex-shrink-0 shadow-sm z-30">
        {/* Logo — first child = far right in RTL; click → leads */}
        <Link to="/leads" className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity" title="לידים">
          {logo ? (
            <img src={logo} alt={tenant?.name ?? 'לוגו'} className="h-8 max-w-[140px] object-contain rounded" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-[#2398c2] flex items-center justify-center text-white font-bold text-sm">A</div>
          )}
        </Link>

        {/* Nav items — centered */}
        <nav className="flex items-center gap-0.5 flex-1 justify-center">
          {PRIMARY_NAV.map(({ to, labelKey, badge }) => {
            const count = badge ? badges[badge] : 0
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-[#2398c2]/10 text-[#2398c2]'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                  }`
                }
                style={{ fontSize: '13px' }}
              >
                {tr(labelKey)}
                {count > 0 && (
                  <span className="absolute -top-1 -left-1 bg-[#2398c2] text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </NavLink>
            )
          })}

          {/* "עוד" — every other fixed page + all custom record types, grouped */}
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setShowMore(s => !s)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                showMore
                  ? 'bg-[#2398c2]/10 text-[#2398c2]'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
              }`}
              style={{ fontSize: '13px' }}
            >
              עוד <span className="text-[10px]">▾</span>
            </button>
            {showMore && (
              <div className="absolute top-full mt-1 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-40 py-1.5 w-48 max-h-[70vh] overflow-y-auto" dir="rtl">
                {MORE_NAV.map(({ to, labelKey }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `block px-4 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-[#2398c2]/10 text-[#2398c2] font-medium'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`
                    }
                  >
                    {tr(labelKey)}
                  </NavLink>
                ))}
                {customNav.length > 0 && (
                  <>
                    <div className="my-1.5 border-t border-gray-100 dark:border-gray-700" />
                    <div className="px-4 py-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">רשומות מותאמות</div>
                    {customNav.map(({ to, label, icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                          `block px-4 py-2 text-sm transition-colors truncate ${
                            isActive
                              ? 'bg-[#2398c2]/10 text-[#2398c2] font-medium'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`
                        }
                      >
                        {icon && <span className="ml-1">{icon}</span>}{label}
                      </NavLink>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </nav>

        {/* Tools — last child = far left in RTL */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => navigate('/settings')}
            title={tr('settings')}
            className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button
            onClick={logout}
            title={tr('logout')}
            className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-gray-500 hover:bg-red-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-900/30 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
          <div
            title={user?.name}
            className="w-8 h-8 rounded-full bg-[#2398c2]/20 flex items-center justify-center text-[13px] font-bold text-[#2398c2] flex-shrink-0 cursor-default mr-1"
          >
            {user?.name?.[0] ?? 'U'}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto dark:bg-gray-900">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
