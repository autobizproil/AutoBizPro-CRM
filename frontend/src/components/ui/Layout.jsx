import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Users, GitBranch, BookUser, Building2,
  Zap, FileText, FileImage, BarChart3, Bell, Sun, Moon, Settings,
} from 'lucide-react'

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('abp-theme') || 'light' } catch { return 'light' }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem('abp-theme', theme) } catch {}
  }, [theme])
  const toggle = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), [])
  return [theme, toggle]
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { t, i18n } = useTranslation()

  const toggleLang = () => {
    const next = i18n.language === 'he' ? 'en' : 'he'
    i18n.changeLanguage(next)
    document.documentElement.setAttribute('dir', next === 'he' ? 'rtl' : 'ltr')
    document.documentElement.setAttribute('lang', next)
  }

  const NAV = [
    { group: null, items: [
      { to: '/dashboard', label: 'לוחות בקרה', icon: LayoutDashboard },
      { to: '/leads',     label: 'לידים',      icon: Users, badge: '128' },
      { to: '/pipeline',  label: 'פייפליין',   icon: GitBranch },
    ]},
    { group: 'אנשים', items: [
      { to: '/contacts',  label: 'אנשי קשר', icon: BookUser },
      { to: '/customers', label: 'לקוחות',    icon: Building2 },
    ]},
    { group: 'כלים', items: [
      { to: '/automations', label: 'אוטומציות', icon: Zap },
      { to: '/forms',       label: 'טפסים',     icon: FileText },
      { to: '/landing',     label: 'דפי נחיתה', icon: FileImage },
      { to: '/reports',     label: 'דוחות',     icon: BarChart3 },
    ]},
  ]

  const PAGE_META = {
    '/dashboard':   { title: 'לוח בקרה',  sub: 'סקירת מכירות · רבעון נוכחי' },
    '/leads':       { title: 'לידים',      sub: null },
    '/pipeline':    { title: 'פייפליין',   sub: null },
    '/contacts':    { title: 'אנשי קשר',  sub: null },
    '/customers':   { title: 'לקוחות',     sub: null },
    '/automations': { title: 'אוטומציות',  sub: null },
    '/forms':       { title: 'טפסים',      sub: null },
    '/landing':     { title: 'דפי נחיתה',  sub: null },
    '/reports':     { title: 'דוחות',      sub: null },
    '/settings':    { title: 'הגדרות',     sub: null },
  }

  const location = useLocation()
  const navigate = useNavigate()
  const [theme, toggleTheme] = useTheme()
  const meta = PAGE_META[location.pathname] || { title: '', sub: null }
  const initials = user?.name ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2) : 'AB'

  return (
    <div className="app" dir="rtl" lang="he">
      {/* Sidebar */}
      <aside className="sidebar">
        <a className="brand" href="/dashboard">
          <img className="brand__logo" src="/assets/autobizpro-logo.png" alt="AutoBiz Pro IL" width={36} height={36} />
          <span className="brand__name bidi-ltr">
            AutoBiz<b>Pro</b><span className="brand__il">IL</span>
          </span>
        </a>

        {NAV.map((sec, i) => (
          <div className="nav-group" key={i}>
            {sec.group && <div className="nav-group__label">{sec.group}</div>}
            {sec.items.map(it => (
              <NavLink
                key={it.to}
                to={it.to}
                className={({ isActive }) => 'nav-item' + (isActive ? ' nav-item--active' : '')}
              >
                <it.icon />
                <span>{it.label}</span>
                {it.badge && <span className="nav-item__badge">{it.badge}</span>}
              </NavLink>
            ))}
          </div>
        ))}

        <div className="sidebar__foot">
          <div className="user-chip" onClick={() => {}}>
            <div className="avatar">{initials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || 'משתמש'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>
                {user?.role || 'מנהל'}
              </div>
            </div>
            <Settings size={16} style={{ color: 'var(--text-subtle)', cursor: 'pointer' }} onClick={() => navigate('/settings')} title="הגדרות" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        <header className="header">
          <div>
            <div className="header__title">{meta.title}</div>
            {meta.sub && <div className="header__sub">{meta.sub}</div>}
          </div>
          <div className="header__spacer" />
          <div className="header__actions">
            <button
              className="btn btn--ghost"
              onClick={toggleLang}
              style={{ fontSize: 12, fontWeight: 700, minWidth: 40, padding: '0 10px' }}
              title="שפה / Language"
            >
              {i18n.language === 'he' ? 'EN' : 'HE'}
            </button>
            <button className="btn btn--ghost btn--icon" title="התראות">
              <Bell size={18} />
            </button>
            <button className="btn btn--ghost btn--icon" onClick={toggleTheme} title={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
