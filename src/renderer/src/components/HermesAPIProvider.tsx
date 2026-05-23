import { createContext, useContext, type ReactNode } from 'react'

const HermesAPIContext = createContext<typeof window.hermesAPI | null>(null)

interface HermesAPIProviderProps {
  children: ReactNode
  api?: typeof window.hermesAPI
}

export function HermesAPIProvider({ children, api }: HermesAPIProviderProps): React.ReactElement {
  const value = api || window.hermesAPI
  return (
    <HermesAPIContext.Provider value={value || null}>
      {children}
    </HermesAPIContext.Provider>
  )
}

export function useHermesAPI(): typeof window.hermesAPI {
  const ctx = useContext(HermesAPIContext)
  if (!ctx) throw new Error('HermesAPI 未初始化')
  return ctx
}

export function useHermesAPIOptional(): typeof window.hermesAPI | null {
  return useContext(HermesAPIContext)
}
