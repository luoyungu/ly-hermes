import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

type Placement = 'top' | 'bottom'

interface PopconfirmProps {
  title?: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  children: React.ReactElement
}

const GAP = 10
const POPOVER_WIDTH = 280
const VIEWPORT_PADDING = 12

function computePlacement(triggerRect: DOMRect): Placement {
  const spaceTop = triggerRect.top
  const spaceBottom = window.innerHeight - triggerRect.bottom

  if (spaceBottom >= 120 || spaceBottom >= spaceTop) return 'bottom'
  return 'top'
}

function computeStyle(placement: Placement, triggerRect: DOMRect): React.CSSProperties {
  const cx = triggerRect.left + triggerRect.width / 2
  const left = Math.min(
    Math.max(cx - POPOVER_WIDTH / 2, VIEWPORT_PADDING),
    window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING,
  )

  switch (placement) {
    case 'top':
      return { top: triggerRect.top - GAP, left, transform: 'translateY(-100%)', width: POPOVER_WIDTH }
    case 'bottom':
      return { top: triggerRect.bottom + GAP, left, transform: 'translateY(0)', width: POPOVER_WIDTH }
  }
}

function Arrow({ placement, triggerRect, style }: { placement: Placement; triggerRect: DOMRect | null; style: React.CSSProperties }): React.ReactElement {
  const popoverLeft = Number(style.left || 0)
  const triggerCenter = triggerRect ? triggerRect.left + triggerRect.width / 2 : popoverLeft + POPOVER_WIDTH / 2
  const arrowLeft = Math.min(Math.max(triggerCenter - popoverLeft, 16), POPOVER_WIDTH - 16)
  const base = 'absolute w-0 h-0'
  switch (placement) {
    case 'top':
      return <div className={`${base} top-full border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[var(--border)]`} style={{ left: arrowLeft, transform: 'translateX(-50%)' }} />
    case 'bottom':
      return <div className={`${base} bottom-full border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-[var(--border)]`} style={{ left: arrowLeft, transform: 'translateX(-50%)' }} />
  }
}

export default function Popconfirm({
  title,
  confirmText,
  cancelText,
  onConfirm,
  children,
}: PopconfirmProps): React.ReactElement {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('common.confirmDelete')
  const resolvedConfirmText = confirmText ?? t('common.delete')
  const resolvedCancelText = cancelText ?? t('common.cancel')
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement>('top')
  const [style, setStyle] = useState<React.CSSProperties>({})
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const p = computePlacement(rect)
    setPlacement(p)
    setTriggerRect(rect)
    setStyle(computeStyle(p, rect))
  }, [])

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const p = computePlacement(rect)
    setPlacement(p)
    setTriggerRect(rect)
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
    const handleScroll = (): void => { setOpen(false) }
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
          <span className="text-sm text-[var(--text-primary)] leading-snug">{resolvedTitle}</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false) }}
            className="px-3 py-1.5 rounded-[var(--radius)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-all"
          >
            {resolvedCancelText}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onConfirm(); setOpen(false) }}
            className="px-3 py-1.5 rounded-[var(--radius)] bg-[var(--danger)] text-xs font-medium text-white hover:opacity-90 cursor-pointer transition-all"
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
      <Arrow placement={placement} triggerRect={triggerRect} style={style} />
    </div>,
    document.body,
  ) : null

  return (
    <div className="inline-flex shrink-0" ref={triggerRef}>
      <div onClick={handleOpen} className="inline-flex shrink-0">
        {children}
      </div>
      {popover}
    </div>
  )
}
