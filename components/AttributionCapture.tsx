'use client'

/**
 * AttributionCapture — on first mount, captures any UTM/gclid params present
 * in the current URL into a first-touch cookie (see lib/attribution.ts), so
 * marketing campaign performance can be tied back to signups later.
 *
 * This component renders nothing — mount it once in the root layout.
 */

import { useEffect } from 'react'
import { captureAttribution } from '@/lib/attribution'

export default function AttributionCapture() {
  useEffect(() => {
    captureAttribution()
  }, [])

  return null
}
