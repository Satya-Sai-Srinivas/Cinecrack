import { useEffect, useRef } from 'react'

/**
 * Calls `onIntersect` when the sentinel element becomes visible.
 * Used for infinite scroll on the movie grid.
 */
export function useIntersectionObserver(onIntersect, { rootMargin = '240px 0px' } = {}) {
  const sentinelRef = useRef(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onIntersect()
      },
      { rootMargin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onIntersect, rootMargin])

  return sentinelRef
}
