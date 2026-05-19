import { useMemo } from 'react'

const isMac = navigator.userAgent.includes('Mac OS X')
const isWindows = navigator.userAgent.includes('Windows')

export function usePlatform(): { isMac: boolean; isWindows: boolean } {
  return useMemo(() => ({ isMac, isWindows }), [])
}
