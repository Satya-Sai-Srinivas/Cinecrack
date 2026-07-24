import { NavLink } from 'react-router-dom';
import { Film, Compass, Globe, Clock, Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../../store/useAppStore'; 
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react"

export default function Sidebar() {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  const navLinks = [
    { name: 'Now Playing', path: '/', icon: Film },
    { name: 'Discover', path: '/discover', icon: Compass },
    { name: 'Cinema Hub', path: '/regional-hub', icon: Globe },
    { name: 'History', path: '/history', icon: Clock },
  ];

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] transition-colors duration-300 hidden md:flex h-screen sticky top-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      
      {/* Brand Logo & Clerk Auth */}
      <div className="p-6 flex items-center gap-3">
        {/* If user is logged in, show their profile picture */}
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>

        {/* If user is logged out, show the Sign In button */}
        <SignedOut>
          <SignInButton mode="modal">
            <button className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shadow-md shrink-0">
              Sign In
            </button>
          </SignInButton>
        </SignedOut>

        <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-main)] to-[var(--accent)]">
          Cinecrack
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto no-scrollbar">
        {navLinks.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.name}
              to={link.path}
              className={({ isActive }) =>
                `group flex items-center gap-4 px-4 py-3 rounded-xl font-medium transition-all duration-300 ${
                  isActive
                    ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25 scale-[1.02]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-main)] hover:scale-[1.02]'
                }`
              }
            >
              <Icon size={20} className="transition-transform duration-300 group-hover:scale-110" />
              {link.name}
            </NavLink>
          );
        })}
      </nav>

      {/* Theme Toggle */}
      <div className="p-4 border-t border-[var(--border-color)]">
        <button
          onClick={toggleTheme}
          className="group flex w-full items-center gap-3 px-4 py-3 rounded-xl text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-main)] transition-all duration-300"
        >
          <div className="transition-transform duration-500 group-hover:rotate-45">
            {theme === 'dark' ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-sky-500" />}
          </div>
          <span className="font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
    </aside>
  );
}