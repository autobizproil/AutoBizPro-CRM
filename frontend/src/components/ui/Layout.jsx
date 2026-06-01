import { Outlet, NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { usePreferences } from '../../context/PreferencesContext'
import { translations } from '../../i18n/translations'
import { tasksApi } from '../../api/tasks'

const nav = [
  { to: '/dashboard',    icon: '📊', labelKey: 'dashboard'    },
  { to: '/reports',      icon: '📈', labelKey: 'reports'      },
  { to: '/leads',        icon: '👥', labelKey: 'leads'        },
  { to: '/clients',      icon: '🏢', labelKey: 'clients'      },
  { to: '/tasks',        icon: '✅', labelKey: 'tasks', badge: 'tasks' },
  { to: '/contacts',     icon: '📋', labelKey: 'contacts'     },
  { to: '/pipeline',     icon: '🔀', labelKey: 'pipeline'     },
  { to: '/automations',  icon: '⚡', labelKey: 'automations'  },
  { to: '/forms',        icon: '📝', labelKey: 'forms'        },
  { to: '/landing-pages',icon: '🌐', labelKey: 'landingPages' },
  { to: '/settings',     icon: '⚙️',  labelKey: 'settings'    },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { lang } = usePreferences()
  const tr = (key) => translations[lang]?.[key] ?? key

  const { data: taskCounts } = useQuery({
    queryKey: ['task-counts'],
    queryFn:  () => tasksApi.counts().then(r => r.data.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const badges = { tasks: taskCounts?.open ?? 0 }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <aside className="w-56 bg-white dark:bg-gray-900 border-l dark:border-gray-800 border-gray-200 flex flex-col shadow-sm flex-shrink-0">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#2398c2] flex items-center justify-center text-white font-bold text-sm">A</div>
            <span className="font-bold text-gray-800 dark:text-gray-100 text-base">AutoBizPro</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto border-b border-gray-100 dark:border-gray-800">
          {nav.map(({ to, icon, labelKey, badge }) => {
            const count = badge ? badges[badge] : 0
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-[#2398c2]/10 text-[#2398c2]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`
                }
                style={{ fontSize: '13px' }}
              >
                <span className="text-base leading-none">{icon}</span>
                <span className="flex-1">{tr(labelKey)}</span>
                {count > 0 && (
                  <span className="bg-[#2398c2] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 dark:text-gray-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#2398c2]/20 flex items-center justify-center text-xs font-bold text-[#2398c2] flex-shrink-0">
                {user?.name?.[0] ?? 'U'}
              </div>
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{user?.name}</span>
            </div>
            <button onClick={logout} className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors">{tr('logout')}</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto dark:bg-gray-900">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
