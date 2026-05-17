import { useState, useEffect } from 'react'
import { Minus, Square, X } from 'lucide-react'

const isWindows = navigator.userAgent.includes('Windows')

export default function WindowControls(): React.ReactElement | null {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!isWindows) return
    window.hermesAPI.windowIsMaximized().then(setIsMaximized).catch(() => {})
    const interval = setInterval(() => {
      window.hermesAPI.windowIsMaximized().then(setIsMaximized).catch(() => {})
    }, 500)
    return () => clearInterval(interval)
  }, [])

  if (!isWindows) return null

  return (
    <div className="flex items-center shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => window.hermesAPI.windowMinimize()}
        className="flex items-center justify-center w-11 h-8 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
      >
        <Minus size={14} />
      </button>
      <button
        onClick={() => { window.hermesAPI.windowMaximize(); setIsMaximized(!isMaximized) }}
        className="flex items-center justify-center w-11 h-8 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
      >
        {isMaximized ? <Square size={10} /> : <Square size={14} />}
      </button>
      <button
        onClick={() => window.hermesAPI.windowClose()}
        className="flex items-center justify-center w-11 h-8 text-[var(--text-dim)] hover:bg-[rgba(239,68,68,0.9)] hover:text-white transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}
