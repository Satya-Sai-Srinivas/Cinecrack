import { useEffect } from 'react'
import { fetchLocation } from '../api'
import { useRegionStore } from '../store/useAppStore'

/**
 * On mount, detects the user's location via IPAPI and stores it
 * in the region store so the Home page can show the LOCAL button.
 */
export function useLocationDetect() {
  const setDetected = useRegionStore((s) => s.setDetected)

  useEffect(() => {
    fetchLocation().then((loc) => {
      if (loc?.countryCode) {
        setDetected(loc.countryCode, loc.city)
      }
    })
  }, [setDetected])
}
