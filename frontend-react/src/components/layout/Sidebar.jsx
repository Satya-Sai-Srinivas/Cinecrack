import { NavLink } from 'react-router-dom'
import {
  Film, Compass, Globe, PanelLeftClose, PanelLeftOpen, Sun, Moon, History,
} from 'lucide-react'
import { useThemeStore, useSidebarStore } from '../../store/useAppStore'

const NAV = [
  { to: '/',          label: 'Now Playing', icon: Film },
  { to: '/discover',  label: 'Discover',    icon: Compass },
  { to: '/hub',       label: 'Cinema Hub',  icon: Globe },
]

export function Sidebar() {
  const { theme, toggleTheme } = useThemeStore()
  const { collapsed, toggle } = useSidebarStore()
  const isDark = theme === 'dark'

  return (
    <aside
      style={{
        width: collapsed ? 80 : 260,
        transition: 'width 0.25s ease',
      }}
      className="fixed top-0 left-0 h-screen z-[1000] flex flex-col gap-8 bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] py-8 px-4 shrink-0"
    >
      {/* Logo + toggle row */}
      <div className="flex items-center justify-between">
        {!collapsed && (
          <span className="text-2xl font-extrabold text-[var(--accent)] tracking-tight whitespace-nowrap">
            🎬 Cinecrack
          </span>
        )}
        <button
          onClick={toggle}
          className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors ml-auto"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 flex-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
               ${isActive
                 ? 'bg-[var(--accent)] text-white shadow-sm'
                 : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-main)]'
               }`
            }
          >
            <Icon size={20} className="shrink-0" />
            {!collapsed && <span className="whitespace-nowrap">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: history link + theme toggle */}
      <div className="flex flex-col gap-1">
        <NavLink
          to="/history"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
             ${isActive
               ? 'bg-[var(--accent)] text-white shadow-sm'
               : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-main)]'
             }`
          }
        >
          <History size={20} className="shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">History</span>}
        </NavLink>

        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-main)] transition-colors w-full text-left"
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDark ? <Sun size={20} className="shrink-0" /> : <Moon size={20} className="shrink-0" />}
          {!collapsed && <span className="whitespace-nowrap">{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
      </div>
    </aside>
  )
}
