import { useMemo } from 'react'

const isMac = navigator.userAgent.includes('Mac OS X')
const isWindows = navigator.userAgent.includes('Windows')
const isElectron = navigator.userAgent.includes('Electron')

export function usePlatform(): { isMac: boolean; isWindows: boolean; isElectron: boolean; isWeb: boolean } {
  return useMemo(() => ({ isMac, isWindows, isElectron, isWeb: !isElectron }), [])
}
