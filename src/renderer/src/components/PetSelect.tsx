import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import PetPicker from './PetPicker'
import PetSprite from './PetSprite'

interface PetSelectProps {
  value: string
  onChange: (slug: string) => void
}

export default function PetSelect({ value, onChange }: PetSelectProps): React.ReactElement {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [petName, setPetName] = useState('')

  useEffect(() => {
    if (!value) {
      setPetName('')
      return
    }
    let cancelled = false
    window.hermesAPI.listPets().then((list) => {
      if (cancelled) return
      setPetName(list.find(p => p.slug === value)?.name || value)
    }).catch(() => {
      if (!cancelled) setPetName(value)
    })
    return () => { cancelled = true }
  }, [value])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="group w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)] bg-[var(--bg-surface)] flex items-center gap-3 cursor-pointer text-left hover:border-[var(--accent)]"
      >
        <div className="relative w-[72px] h-[72px] rounded-2xl glass-medium border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0 bg-[var(--bg-primary)]">
          {value ? (
            <PetSprite slug={value} status="idle" scale={0.28} static />
          ) : (
            <span className="text-[28px] text-[var(--text-dim)]">🐾</span>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10px] flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
            ✎
          </span>
        </div>
        <div className="flex-1 min-w-0">
          {value ? (
            <>
              <div className="text-sm font-medium text-[var(--text-primary)] truncate">{petName || value}</div>
              <div className="text-xs text-[var(--text-dim)] truncate mt-0.5">{value}</div>
            </>
          ) : (
            <span className="text-[var(--text-dim)]">{t('manage.selectPet')}</span>
          )}
        </div>
      </button>
      {open && (
        <PetPicker
          value={value}
          onChange={(slug) => {
            onChange(slug)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
