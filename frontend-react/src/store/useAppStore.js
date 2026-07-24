import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ---------- Theme store (persisted) ----------
export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'light',
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light'
        set({ theme: next })
        if (next === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      },
    }),
    { name: 'cinecrack-theme-storage' }
  )
)

// ---------- Region / Language store ----------
export const useRegionStore = create((set) => ({
  currentRegion: 'US',
  currentLang: 'all',
  detectedRegion: null,

  setRegion: (region) =>
    set((s) => ({
      currentRegion: region,
      // Reset language when switching to non-IN region
      currentLang: region === 'IN' ? s.currentLang : 'all',
    })),

  setLang: (lang) => set({ currentLang: lang }),

  setDetected: (region) => set({ detectedRegion: region }),
}))

// ---------- Chat store (session-like) ----------
export const useChatStore = create((set) => ({
  isOpen: false,
  history: [],      // { role, content, recommendations? }[]
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  addMessage: (msg) => set((s) => ({ history: [...s.history, msg] })),
  updateLastAssistant: (content, recommendations) =>
    set((s) => {
      const history = [...s.history]
      const lastIdx = history.map((m) => m.role).lastIndexOf('assistant')
      if (lastIdx >= 0) {
        history[lastIdx] = { ...history[lastIdx], content, recommendations }
      }
      return { history }
    }),
  clearHistory: () => set({ history: [] }),
}))
