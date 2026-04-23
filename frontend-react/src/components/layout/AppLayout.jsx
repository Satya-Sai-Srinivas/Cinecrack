import { Outlet } from 'react-router-dom'
import  Sidebar  from './Sidebar'
import { MobileBottomNav } from './MobileBottomNav'
import { ChatbotWidget } from '../chatbot/ChatbotWidget'

export function AppLayout() {
  return (
    <div className="flex h-screen w-full bg-[var(--bg-color)] overflow-hidden">
      
      {/* Sidebar - Hidden on mobile, visible on desktop */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content area - Adds bottom padding on mobile for the tab bar */}
      <main className="flex-1 h-full overflow-y-auto pb-20 md:pb-0 relative w-full">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-[40] w-full h-14 bg-[var(--bg-color)]/80 backdrop-blur-xl border-b border-[var(--border-color)] flex items-center px-4">
          <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-main)] to-[var(--accent)] tracking-tight">
            Cinerack
          </span>
        </header>
        
        <Outlet />
      </main>

      {/* Bottom Nav - Visible on mobile, hidden on desktop */}
      <MobileBottomNav />

      {/* Global chatbot */}
      <ChatbotWidget />
    </div>
  )
}