import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AVATARS } from '../shared/employee-shared'

interface AvatarSelectProps {
  value: string
  onChange: (avatar: string) => void
}

const PANEL_WIDTH = 240

export default function AvatarSelect({ value, onChange }: AvatarSelectProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8))
    const top = Math.min(rect.bottom + 8, window.innerHeight - 280)
    setPos({ top: Math.max(8, top), left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (anchorRef.current?.contains(e.target as Node)) return
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = useCallback((avatar: string) => {
    onChange(avatar)
    setOpen(false)
  }, [onChange])

  const panel = open && pos ? (
    <div
      ref={panelRef}
      className="fixed z-[999] p-3 rounded-xl glass-heavy border border-[var(--border)] grid grid-cols-4 gap-2 shadow-[0_8px_32px_rgba(0,0,0,0.3)] animate-scale-in"
      style={{ width: PANEL_WIDTH, top: pos.top, left: pos.left }}
      role="listbox"
      aria-label="选择头像"
    >
      {AVATARS.map((a, i) => (
        <button
          key={`${a}-${i}`}
          type="button"
          role="option"
          aria-selected={value === a}
          onClick={() => handleSelect(a)}
          className={`w-11 h-11 rounded-lg flex items-center justify-center text-[22px] cursor-pointer transition-colors border ${
            value === a
              ? 'bg-[var(--accent-glow)] border-[var(--accent)]'
              : 'border-transparent hover:bg-[var(--bg-hover)] hover:border-[var(--border)]'
          }`}
        >
          {a}
        </button>
      ))}
    </div>
  ) : null

  return (
    <>
      <div ref={anchorRef} className="shrink-0">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="group relative w-[72px] h-[72px] rounded-2xl glass-medium flex items-center justify-center text-[36px] border border-[var(--border)] cursor-pointer hover:border-[var(--accent)] transition-colors"
        >
          {value}
          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10px] flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
            ✎
          </span>
        </button>
      </div>
      {panel && createPortal(panel, document.body)}
    </>
  )
}
