import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { fetchNotifications, markNotificationsRead } from '../../api'

export default function NotificationBell({ align = 'right' }) {
  const { getToken, isSignedIn } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const btnRef = useRef(null)

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => fetchNotifications(await getToken()),
    enabled: isSignedIn,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  })

  const markRead = useMutation({
    mutationFn: async () => markNotificationsRead(await getToken()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  if (!isSignedIn) return null

  const unread = data?.unread ?? 0
  const items = data?.items ?? []

  const toggle = () => {
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) {
        setCoords({ top: r.bottom + 8, left: r.left, right: window.innerWidth - r.right })
      }
      if (unread > 0) markRead.mutate()
    }
    setOpen((v) => !v)
  }

  // Fixed-position panel rendered in a portal so it's never clipped by the sidebar.
  const panelStyle =
    align === 'left'
      ? { top: coords?.top, left: coords?.left }
      : { top: coords?.top, right: coords?.right }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex items-center justify-center w-9 h-9 rounded-full text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface)] transition-colors"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && coords &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[1400]" onClick={() => setOpen(false)} />
            <div
              style={panelStyle}
              className="fixed w-80 max-w-[calc(100vw-2rem)] max-h-96 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] shadow-2xl z-[1500]"
            >
              <div className="px-4 py-3 border-b border-[var(--border-color)]">
                <p className="text-sm font-bold text-[var(--text-main)]">Notifications</p>
              </div>
              {items.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">
                  No notifications yet. We'll alert you when a watchlist movie starts streaming on your services.
                </p>
              ) : (
                items.map((n) => (
                  <Link
                    key={n.id}
                    to={n.movie_id ? `/movie/${n.movie_id}` : '#'}
                    onClick={() => setOpen(false)}
                    className={`block px-4 py-3 border-b border-[var(--border-color)]/50 hover:bg-[var(--surface)] transition-colors ${
                      !n.is_read ? 'bg-[var(--accent)]/5' : ''
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--text-main)] line-clamp-1">{n.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">{n.body}</p>
                  </Link>
                ))
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  )
}
