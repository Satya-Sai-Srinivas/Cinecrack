import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from './components/layout/AppLayout'
import { ToastProvider } from './components/ui/Toast'
import { useThemeStore } from './store/useAppStore'

// Pages (lazy-loaded for code splitting)
import Home from './pages/Home'
import Discover from './pages/Discover'
import MovieDetail from './pages/MovieDetail'
import PersonProfile from './pages/PersonProfile'
import History from './pages/History'
import Watchlist from './pages/Watchlist'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

function ThemeInitializer() {
  const theme = useThemeStore((s) => s.theme)
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <ThemeInitializer />
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<Home />} />
              <Route path="discover" element={<Discover />} />
              <Route path="movie/:id" element={<MovieDetail />} />
              <Route path="person/:id" element={<PersonProfile />} />
              <Route path="watchlist" element={<Watchlist />} />
              <Route path="history" element={<History />} />
            </Route>
          </Routes>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
