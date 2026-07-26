import { Outlet, Link } from 'react-router-dom'
import { Tv } from 'lucide-react'
import Sidebar from './Sidebar'
import NotificationBell from './NotificationBell'
import { MobileBottomNav } from './MobileBottomNav'
import { ChatbotWidget } from '../chatbot/ChatbotWidget'
import ServicesOnboarding from '../ServicesOnboarding'
import { useLocationDetect } from '../../hooks/useLocation'

export function AppLayout() {
  // Detect the visitor's country once, app-wide (drives the default region + services).
  useLocationDetect()

  return (
    <div className="flex h-screen w-full bg-[var(--bg-color)] overflow-hidden">

      {/* Sidebar - Hidden on mobile, visible on desktop */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content area - Adds bottom padding on mobile for the tab bar */}
      <main className="flex-1 h-full overflow-y-auto pb-20 md:pb-0 relative w-full">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-[40] w-full h-14 bg-[var(--bg-color)]/80 backdrop-blur-xl border-b border-[var(--border-color)] flex items-center justify-between px-4">
          <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-main)] to-[var(--accent)] tracking-tight">
            Cinecrack
          </span>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Link
              to="/settings"
              aria-label="My Services"
              className="flex items-center justify-center w-9 h-9 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            >
              <Tv size={20} />
            </Link>
          </div>
        </header>

        <Outlet />
      </main>

      {/* Bottom Nav - Visible on mobile, hidden on desktop */}
      <MobileBottomNav />

      {/* Global chatbot */}
      <ChatbotWidget />

      {/* First-run streaming-services prompt */}
      <ServicesOnboarding />
    </div>
  )
}
