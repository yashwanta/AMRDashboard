import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Server, FileText, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'

const nav = [
  { to: '/',         label: 'Dashboard',  Icon: LayoutDashboard },
  { to: '/logs',     label: 'Logs',       Icon: FileText },
  { to: '/servers',  label: 'Servers',    Icon: Server },
  { to: '/sync',     label: 'Sync Jobs',  Icon: RefreshCw },
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
  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 text-gray-300 flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-700">
        <RoboWatchLogo />
        <div>
          <span className="font-bold text-white text-base tracking-wide">RoboWatch</span>
          <p className="text-xs text-gray-500 leading-none mt-0.5">Fleet Monitor</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ to, label, Icon }) => (
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
      </nav>
      <div className="px-5 py-4 text-xs text-gray-500 border-t border-gray-700">
        Auto-sync: 6 AM &amp; 6 PM
      </div>
    </aside>
  )
}
