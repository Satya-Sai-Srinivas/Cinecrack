import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ChatbotWidget } from '../chatbot/ChatbotWidget'
import { useSidebarStore } from '../../store/useAppStore'

export function AppLayout() {
  const { collapsed } = useSidebarStore()
  const sidebarWidth = collapsed ? 80 : 260

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />

      {/* Main content offset by sidebar width */}
      <main
        style={{ marginLeft: sidebarWidth, transition: 'margin-left 0.25s ease' }}
        className="flex-1 min-h-screen overflow-y-auto"
      >
        <Outlet />
      </main>

      {/* Global chatbot — never unmounts during route transitions */}
      <ChatbotWidget />
    </div>
  )
}
