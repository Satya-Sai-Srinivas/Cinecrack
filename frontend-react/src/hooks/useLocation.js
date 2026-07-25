import { useEffect } from 'react'
import { fetchLocation } from '../api'
import { useRegionStore } from '../store/useAppStore'

/**
 * On mount, detects the user's location via IPAPI and stores it
 * in the region store so the Home page can show the LOCAL button.
 */
export function useLocationDetect() {
  const applyDetectedDefault = useRegionStore((s) => s.applyDetectedDefault)

  useEffect(() => {
    fetchLocation().then((loc) => {
      if (loc?.countryCode) {
        applyDetectedDefault(loc.countryCode)
      }
    })
  }, [applyDetectedDefault])
}
