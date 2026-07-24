import { NavLink } from 'react-router-dom'
import { Film, Compass, Globe, History } from 'lucide-react'

const TABS = [
  { to: '/', label: 'Home', icon: Film },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/regional-hub', label: 'Hub', icon: Globe },
  { to: '/history', label: 'History', icon: History },
]

export function MobileBottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full bg-[var(--surface)]/90 backdrop-blur-xl border-t border-[var(--border-color)] z-[50] pb-safe">
      <div className="flex items-center justify-around h-16 px-2">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-16 h-full gap-1 transition-all duration-300 ${
                isActive 
                  ? 'text-[var(--accent)] scale-110' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`
            }
          >
            <Icon size={20} strokeWidth={2.5} />
            <span className="text-[10px] font-bold">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}