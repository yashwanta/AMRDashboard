import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Server, FileText, RefreshCw, Activity } from 'lucide-react'
import { clsx } from 'clsx'

const nav = [
  { to: '/',         label: 'Dashboard',  Icon: LayoutDashboard },
  { to: '/logs',     label: 'Logs',       Icon: FileText },
  { to: '/servers',  label: 'Servers',    Icon: Server },
  { to: '/sync',     label: 'Sync Jobs',  Icon: RefreshCw },
]

export default function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 text-gray-300 flex flex-col">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-700">
        <Activity className="text-blue-400" size={22} />
        <span className="font-bold text-white text-lg">AMR Dashboard</span>
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
