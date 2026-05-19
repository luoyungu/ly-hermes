import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

type Placement = 'top' | 'bottom' | 'left' | 'right'

interface PopconfirmProps {
  title?: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  children: React.ReactElement
}

const GAP = 8

function computePlacement(triggerRect: DOMRect): Placement {
  const spaceTop = triggerRect.top
  const spaceBottom = window.innerHeight - triggerRect.bottom
  const spaceLeft = triggerRect.left
  const spaceRight = window.innerWidth - triggerRect.right

  const placements: Array<{ dir: Placement; space: number }> = [
    { dir: 'top', space: spaceTop },
    { dir: 'bottom', space: spaceBottom },
    { dir: 'right', space: spaceRight },
    { dir: 'left', space: spaceLeft },
  ]
  placements.sort((a, b) => b.space - a.space)
  return placements[0].dir
}

function computeStyle(placement: Placement, triggerRect: DOMRect): React.CSSProperties {
  const cx = triggerRect.left + triggerRect.width / 2
  const cy = triggerRect.top + triggerRect.height / 2

  switch (placement) {
    case 'top':
      return { top: triggerRect.top - GAP, left: cx, transform: 'translate(-50%, -100%)' }
    case 'bottom':
      return { top: triggerRect.bottom + GAP, left: cx, transform: 'translate(-50%, 0)' }
    case 'left':
      return { top: cy, left: triggerRect.left - GAP, transform: 'translate(-100%, -50%)' }
    case 'right':
      return { top: cy, left: triggerRect.right + GAP, transform: 'translate(0, -50%)' }
  }
}

function Arrow({ placement }: { placement: Placement }): React.ReactElement {
  const base = 'absolute w-0 h-0'
  switch (placement) {
    case 'top':
      return <div className={`${base} left-1/2 -translate-x-1/2 top-full border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[var(--border)]`} />
    case 'bottom':
      return <div className={`${base} left-1/2 -translate-x-1/2 bottom-full border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-[var(--border)]`} />
    case 'left':
      return <div className={`${base} top-1/2 -translate-y-1/2 left-full border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[6px] border-l-[var(--border)]`} />
    case 'right':
      return <div className={`${base} top-1/2 -translate-y-1/2 right-full border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-[var(--border)]`} />
  }
}

export default function Popconfirm({
  title = '确认删除？',
  confirmText = '删除',
  cancelText = '取消',
  onConfirm,
  children,
}: PopconfirmProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement>('top')
  const [style, setStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const p = computePlacement(rect)
    setPlacement(p)
    setStyle(computeStyle(p, rect))
  }, [])

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const p = computePlacement(rect)
    setPlacement(p)
    setStyle(computeStyle(p, rect))
    setOpen(true)
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent): void => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    const handleScroll = (): void => {
      updatePos()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', updatePos)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open, updatePos])

  const popover = open ? createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[99999] animate-scale-in"
      style={style}
    >
      <div className="glass-heavy border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-3 min-w-[180px]">
        <div className="flex items-start gap-2 mb-3">
          <AlertTriangle size={16} className="text-[var(--danger)] shrink-0 mt-0.5" />
          <span className="text-sm text-[var(--text-primary)] leading-snug">{title}</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false) }}
            className="px-3 py-1.5 rounded-[var(--radius)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-all"
          >
            {cancelText}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onConfirm(); setOpen(false) }}
            className="px-3 py-1.5 rounded-[var(--radius)] bg-[var(--danger)] text-xs font-medium text-white hover:opacity-90 cursor-pointer transition-all"
          >
            {confirmText}
          </button>
        </div>
      </div>
      <Arrow placement={placement} />
    </div>,
    document.body,
  ) : null

  return (
    <div className="inline-flex" ref={triggerRef}>
      <div onClick={handleOpen} className="inline-flex shrink-0">
        {children}
      </div>
      {popover}
    </div>
  )
}
