import { useState, useEffect, useRef } from 'react'

const FRAME_WIDTH = 192
const FRAME_HEIGHT = 208
const COLUMNS = 8
const ROWS = 9

const STATE_CONFIG: Record<string, { row: number; frames: number; duration: number }> = {
  idle:           { row: 0, frames: 6, duration: 6600 },
  'running-right':{ row: 1, frames: 8, duration: 920 },
  'running-left': { row: 2, frames: 8, duration: 920 },
  failed:         { row: 5, frames: 8, duration: 1200 },
  waiting:        { row: 6, frames: 6, duration: 1000 },
  running:        { row: 7, frames: 6, duration: 820 },
  review:         { row: 8, frames: 6, duration: 1060 },
}

const EMPLOYEE_STATUS_TO_PET: Record<string, string> = {
  awake: 'idle',
  online: 'idle',
  sleeping: 'idle',
  idle: 'idle',
  busy: 'running',
  starting: 'running',
  streaming: 'running',
  thinking: 'waiting',
  tool: 'running',
  done: 'review',
  error: 'failed',
  waiting: 'waiting',
}

interface PetSpriteProps {
  slug: string
  status?: string
  scale?: number
  className?: string
  static?: boolean
}

export default function PetSprite({ slug, status = 'awake', scale = 1, className = '', static: isStatic = false }: PetSpriteProps): React.ReactElement | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const prevSlugRef = useRef(slug)

  useEffect(() => {
    if (prevSlugRef.current !== slug) {
      setLoading(true)
      setDataUrl(null)
      prevSlugRef.current = slug
    }
    let cancelled = false
    window.hermesAPI.getPetSpritesheet(slug).then((result) => {
      if (!cancelled) {
        setDataUrl(result)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [slug])

  if (loading) {
    return (
      <div
        className={className}
        style={{
          width: FRAME_WIDTH * scale,
          height: FRAME_HEIGHT * scale,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.3,
        }}
      >
        <span style={{ fontSize: 16 * scale }}>🐾</span>
      </div>
    )
  }

  if (!dataUrl) return null

  const petState = EMPLOYEE_STATUS_TO_PET[status] || 'idle'
  const config = STATE_CONFIG[petState] || STATE_CONFIG.idle
  const row = config.row
  const frames = config.frames
  const durationMs = config.duration

  const w = FRAME_WIDTH * scale
  const h = FRAME_HEIGHT * scale
  const totalW = FRAME_WIDTH * COLUMNS * scale
  const totalH = FRAME_HEIGHT * ROWS * scale
  const animWidth = FRAME_WIDTH * frames * scale

  if (isStatic) {
    return (
      <div
        className={`pet-sprite ${className}`}
        style={{
          width: w,
          height: h,
          overflow: 'hidden',
          position: 'relative',
          imageRendering: 'pixelated',
        }}
      >
        <div
          style={{
            width: w,
            height: h,
            backgroundImage: `url(${dataUrl})`,
            backgroundSize: `${totalW}px ${totalH}px`,
            backgroundPosition: `0px ${-row * h}px`,
            backgroundRepeat: 'no-repeat',
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={`pet-sprite ${className}`}
      style={{
        width: w,
        height: h,
        overflow: 'hidden',
        position: 'relative',
        imageRendering: 'pixelated',
      }}
    >
      <div
        style={{
          width: w,
          height: h,
          backgroundImage: `url(${dataUrl})`,
          backgroundSize: `${totalW}px ${totalH}px`,
          backgroundPositionY: -row * h,
          backgroundPositionX: 0,
          animation: `pet-play-${slug}-${petState} ${durationMs}ms steps(${frames}) infinite`,
        }}
      />
      <style>{`
        @keyframes pet-play-${slug}-${petState} {
          from { background-position-x: 0; }
          to { background-position-x: -${animWidth}px; }
        }
      `}</style>
    </div>
  )
}
