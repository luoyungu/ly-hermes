import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import PetSprite from './PetSprite'

interface PetInfo {
  slug: string
  name: string
  spritesheetUrl?: string
  tags?: string[]
  vibes?: string[]
  kind?: string
}

interface PetPickerProps {
  value: string
  onChange: (slug: string) => void
  onClose: () => void
}

const PAGE_SIZE = 9

export default function PetPicker({ value, onChange, onClose }: PetPickerProps): React.ReactElement {
  const [pets, setPets] = useState<PetInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    window.hermesAPI.listPets().then(list => {
      setPets(list)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { setPage(0) }, [search])

  const handleChange = useCallback((slug: string) => {
    onChange(slug)
    onCloseRef.current()
  }, [onChange])

  const filtered = pets.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.slug.toLowerCase().includes(search.toLowerCase()) ||
    (p.tags || []).some(t => t.toLowerCase().includes(search.toLowerCase())) ||
    (p.vibes || []).some(v => v.toLowerCase().includes(search.toLowerCase()))
  )

  const totalPages = Math.max(1, Math.ceil((filtered.length + 1) / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const allItems = [{ slug: '', name: '不选择', isNone: true as const }, ...filtered.map(p => ({ ...p, isNone: false as const }))]
  const pageItems = allItems.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <div ref={ref} className="absolute top-full left-0 mt-2 w-[320px] rounded-xl glass-heavy border border-[var(--border)] z-20 shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)]">
        <Search size={14} className="text-[var(--text-dim)] shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索宠物..."
          className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none"
          autoFocus
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] cursor-pointer">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="p-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[var(--text-dim)]">
            <Loader2 size={18} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-dim)] text-sm">
            {search ? '未找到匹配的宠物' : '暂无可用宠物'}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {pageItems.map(item => (
              <button
                key={item.isNone ? '__none__' : item.slug}
                onClick={() => handleChange(item.slug)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg cursor-pointer transition-colors border ${
                  value === item.slug
                    ? 'bg-[var(--accent-glow)] border-[var(--accent)]'
                    : 'border-transparent hover:bg-[var(--bg-hover)] hover:border-[var(--border)]'
                }`}
              >
                <div className="w-14 h-14 rounded-lg border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0 bg-[var(--bg-surface)]">
                  {item.isNone ? (
                    <span className="text-[var(--text-dim)] text-lg">✕</span>
                  ) : (
                    <PetSprite slug={item.slug} status="idle" scale={0.15} static />
                  )}
                </div>
                <span className="text-[11px] text-[var(--text-secondary)] truncate w-full text-center leading-tight">
                  {item.isNone ? '无' : item.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border)]">
          <button
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="p-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-30 cursor-pointer disabled:cursor-default transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-[var(--text-dim)]">{safePage + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            disabled={safePage >= totalPages - 1}
            className="p-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-30 cursor-pointer disabled:cursor-default transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
