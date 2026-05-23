import { useEffect, useState } from 'react'
import type { DeploymentMode } from '../../../preload/index'

export function useDeploymentMode(): DeploymentMode | null {
  const [mode, setMode] = useState<DeploymentMode | null>(null)

  useEffect(() => {
    const load = (): void => {
      if (!window.hermesAPI?.getDeploymentMode) return
      window.hermesAPI.getDeploymentMode().then(setMode).catch(() => setMode(null))
    }
    load()
    window.addEventListener('hermes:deployment-changed', load)
    return () => window.removeEventListener('hermes:deployment-changed', load)
  }, [])

  return mode
}
