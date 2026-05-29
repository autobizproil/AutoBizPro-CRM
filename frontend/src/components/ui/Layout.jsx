import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const nav = [
  { to: '/dashboard',   icon: '📊', label: 'דשבורד'    },
  { to: '/leads',       icon: '👥', label: 'לידים'      },
  { to: '/contacts',    icon: '📋', label: 'אנשי קשר'  },
  { to: '/pipeline',    icon: '🔀', label: 'פייפליין'   },
  { to: '/import',      icon: '📥', label: 'ייבוא'      },
  { to: '/automations', icon: '⚡', label: 'אוטומציות' },
  { to: '/forms',       icon: '📝', label: 'טפסים'      },
  { to: '/settings',    icon: '⚙️',  label: 'הגדרות'    },
]

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      <aside className="w-56 bg-white border-l border-gray-200 flex flex-col shadow-sm flex-shrink-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">C</div>
            <span className="font-bold text-gray-800 text-base">CRM Pro</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                {user?.name?.[0] ?? 'U'}
              </div>
              <span className="text-xs text-gray-700 truncate">{user?.name}</span>
            </div>
            <button onClick={logout} className="text-xs text-gray-400 hover:text-red-500 transition-colors">יציאה</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
