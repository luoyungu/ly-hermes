import { useState, useEffect, useRef, useCallback } from 'react'
import PetSprite from './PetSprite'

const CLICK_ACTIONS = ['running-right', 'running-left', 'review', 'waiting']
const CLICK_MESSAGES: Record<string, string> = {
  idle: '我在休息~',
  running: '努力工作中...',
  thinking: '我想一想...',
  tool: '我去办一下...',
  'running-right': '跑起来啦！',
  'running-left': '我往这边跑~',
  failed: '呜呜出错了...',
  waiting: '在等你呢！',
  review: '看看我做的怎么样？',
}

const ACTION_DURATION = 2000

interface InteractivePetProps {
  slug: string
  status: string
  scale?: number
  onToggleHide?: () => void
  activity?: {
    type: 'thinking' | 'tool'
    label?: string
  } | null
}

export default function InteractivePet({ slug, status, scale = 0.5, onToggleHide, activity }: InteractivePetProps): React.ReactElement {
  const [overrideState, setOverrideState] = useState<string | null>(null)
  const [showBubble, setShowBubble] = useState(false)
  const [bubbleText, setBubbleText] = useState('')
  const [bounce, setBounce] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activityStatus = activity?.type === 'tool' ? 'tool' : activity?.type === 'thinking' ? 'thinking' : null
  const currentStatus = overrideState || activityStatus || status

  const handleClick = useCallback(() => {
    const action = CLICK_ACTIONS[Math.floor(Math.random() * CLICK_ACTIONS.length)]
    setOverrideState(action)
    setBounce(true)
    setBubbleText(CLICK_MESSAGES[action] || '嘿！')
    setShowBubble(true)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setOverrideState(null)
      setBounce(false)
    }, ACTION_DURATION)

    setTimeout(() => setShowBubble(false), 1800)
  }, [])

  const handleDoubleClick = useCallback(() => {
    setBubbleText('拜拜~ 👋')
    setShowBubble(true)
    setTimeout(() => {
      setShowBubble(false)
      onToggleHide?.()
    }, 800)
  }, [onToggleHide])

  const handleMouseEnter = useCallback(() => {
    if (!overrideState) {
      setBubbleText(CLICK_MESSAGES[status] || '你好！')
      setShowBubble(true)
    }
  }, [overrideState, status])

  const handleMouseLeave = useCallback(() => {
    if (!overrideState) setShowBubble(false)
  }, [overrideState])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div
      className="relative cursor-pointer select-none"
      style={{
        transition: 'transform 0.2s ease',
        transform: bounce ? 'scale(1.1)' : 'scale(1)',
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <PetSprite slug={slug} status={currentStatus} scale={scale} />

      {activity && !showBubble && (
        <div
          className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium z-10 flex items-center gap-1.5"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: activity.type === 'tool' ? 'var(--accent)' : 'var(--warning)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.22)',
            animation: 'pet-bubble-in 0.25s ease-out',
          }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse-custom" style={{ background: activity.type === 'tool' ? 'var(--accent)' : 'var(--warning)' }} />
          {activity.type === 'tool' ? `调用 ${activity.label || '工具'}` : '思考中'}
        </div>
      )}

      {showBubble && (
        <div
          className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium z-10"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            animation: 'pet-bubble-in 0.25s ease-out',
          }}
        >
          {bubbleText}
          <div
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
            style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
          />
        </div>
      )}

      <style>{`
        @keyframes pet-bubble-in {
          from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.9); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
