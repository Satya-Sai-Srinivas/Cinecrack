import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { ChatbotWidget } from '../chatbot/ChatbotWidget'

export function AppLayout() {
  return (
    <div className="flex h-screen w-full bg-[var(--bg-color)] overflow-hidden">
      <Sidebar />

      {/* flex-1 automatically fills the remaining space perfectly flush against the sidebar */}
      <main className="flex-1 h-full overflow-y-auto">
        <Outlet />
      </main>

      {/* Global chatbot */}
      <ChatbotWidget />
    </div>
  )
}