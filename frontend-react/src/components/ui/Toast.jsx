import { useState, useCallback, useEffect, createContext, useContext } from 'react'
import { X } from 'lucide-react'

const ToastContext = createContext(null)

let _addToast = null

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration)
  }, [])

  // Allow imperative usage: toast('message')
  useEffect(() => { _addToast = addToast }, [addToast])

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id))

  const typeStyles = {
    info: 'bg-[var(--surface)] border-[var(--border-color)] text-[var(--text-main)]',
    success: 'bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300',
    error: 'bg-red-50 border-red-300 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300',
  }

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium
              pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200
              ${typeStyles[t.type] ?? typeStyles.info}`}
          >
            <span>{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-1 opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

/** Imperative helper — usable outside React components */
export const toast = (message, type = 'info', duration = 3000) => {
  _addToast?.(message, type, duration)
}
