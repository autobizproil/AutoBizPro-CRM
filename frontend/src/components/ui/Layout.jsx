import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const nav = [
  { to: '/dashboard',   label: 'דשבורד' },
  { to: '/leads',       label: 'לידים' },
  { to: '/pipeline',    label: 'פייפליין' },
  { to: '/contacts',    label: 'אנשי קשר' },
  { to: '/automations', label: 'אוטומציות' },
  { to: '/forms',       label: 'טפסים' },
  { to: '/settings',    label: 'הגדרות' },
]

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-indigo-600">CRM</h1>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-2">{user?.name}</div>
          <button
            onClick={logout}
            className="w-full text-right text-sm text-red-500 hover:text-red-700 px-3 py-1"
          >
            התנתק
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
