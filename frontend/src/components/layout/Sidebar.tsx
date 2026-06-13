import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Server, FileText, RefreshCw, Wrench, LogOut, Bot, LogIn, Settings, ServerCog } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '../../auth'

const publicNav = [
  { to: '/',         label: 'Dashboard',  Icon: LayoutDashboard },
  { to: '/logs',     label: 'Logs',       Icon: FileText },
  { to: '/ask', label: 'Ask SiteOps', Icon: Bot },
]

const adminNav = [
  { to: '/servers',  label: 'Servers',    Icon: Server },
  { to: '/endpoints', label: 'Endpoints', Icon: ServerCog },
  { to: '/sync',     label: 'Sync Jobs',  Icon: RefreshCw },
]

const privilegedNav = [
  { to: '/automation', label: 'OpsForge', Icon: Wrench },
  { to: '/setup', label: 'Setup', Icon: Settings },
]

function RoboWatchLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2L4 6v8c0 5.5 4.3 10.7 10 12 5.7-1.3 10-6.5 10-12V6L14 2z" fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="1.5"/>
      <rect x="9" y="9" width="10" height="8" rx="2" fill="#3b82f6" fillOpacity="0.8"/>
      <circle cx="11.5" cy="12" r="1.2" fill="white"/>
      <circle cx="16.5" cy="12" r="1.2" fill="white"/>
      <rect x="12" y="14.5" width="4" height="1" rx="0.5" fill="white"/>
      <rect x="13.5" y="7" width="1" height="2" rx="0.5" fill="#3b82f6"/>
      <circle cx="14" cy="6.5" r="1" fill="#60a5fa"/>
    </svg>
  )
}

export default function Sidebar() {
  const auth = useAuth()
  const navigate = useNavigate()

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 text-gray-300 flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-700">
        <RoboWatchLogo />
        <div>
          <span className="font-bold text-white text-base tracking-wide">DRISHTI</span>
          <p className="text-xs text-gray-500 leading-none mt-0.5">SiteOps</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {publicNav.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-800 hover:text-white'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
        <div className="pt-4 mt-4 border-t border-gray-800">
          <div className="px-3 pb-2 text-[11px] uppercase tracking-wider text-gray-600">Admin</div>
          {!auth.isAuthenticated && (
            <NavLink
              to="/login"
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-cyan-600 text-white' : 'hover:bg-gray-800 hover:text-white'
                )
              }
            >
              <LogIn size={18} />
              Admin Login
            </NavLink>
          )}
          {auth.isAuthenticated && [...adminNav, ...(auth.canAdmin ? privilegedNav : [])].map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 hover:text-white'
                  )
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
        </div>
      </nav>
      <div className="px-5 py-4 text-xs text-gray-500 border-t border-gray-700 space-y-3">
        {auth.isAuthenticated ? (
          <>
            <div>
              <div className="text-gray-400">{auth.username}</div>
              <div className="text-gray-500">{auth.role}</div>
            </div>
            <button
              onClick={() => {
                auth.logout()
                navigate('/')
              }}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </>
        ) : (
          <div>Auto-sync: 6 AM &amp; 6 PM</div>
        )}
      </div>
    </aside>
  )
}
