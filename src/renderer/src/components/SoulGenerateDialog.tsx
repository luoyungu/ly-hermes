import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Sparkles, Loader2 } from 'lucide-react'
import { translateError } from '../../../shared/i18n'
import { showToast } from '../App'
import { useEmployeeShared } from '../shared/employee-shared'

export interface SoulDraftResult {
  name: string
  displayName: string
  role: string
  soul: string
}

interface SoulGenerateDialogProps {
  open: boolean
  onClose: () => void
  onApply: (draft: SoulDraftResult) => void
  context: {
    name: string
    displayName: string
    soul: string
  }
  soulModelInfo: { model: string; provider: string; ready: boolean; hint?: string } | null
}

export default function SoulGenerateDialog({
  open,
  onClose,
  onApply,
  context,
  soulModelInfo,
}: SoulGenerateDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const { soulStyles, soulPrompts } = useEmployeeShared()

  const [instruction, setInstruction] = useState('')
  const [style, setStyle] = useState('detailed')
  const [draft, setDraft] = useState<SoulDraftResult>({ name: '', displayName: '', role: '', soul: '' })
  const [generating, setGenerating] = useState(false)
  const [generatedInSession, setGeneratedInSession] = useState(false)

  const hasDraft = Boolean(draft.soul.trim())

  useEffect(() => {
    if (!open) return
    setInstruction('')
    setStyle('detailed')
    setDraft({
      name: context.name,
      displayName: context.displayName,
      role: '',
      soul: context.soul,
    })
    setGeneratedInSession(false)
  }, [open, context.name, context.displayName, context.soul])

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (soulModelInfo && !soulModelInfo.ready) {
      showToast(soulModelInfo.hint || t('manage.configureModel'), 'error')
      return
    }

    const text = instruction.trim()
    if (hasDraft) {
      if (!text) {
        showToast(t('manage.soulRefineRequired'), 'error')
        return
      }
    } else if (!text && !context.displayName.trim() && !context.name.trim()) {
      showToast(t('manage.enterSoulDesc'), 'error')
      return
    }

    setGenerating(true)
    try {
      const basePrompt = context.displayName.trim() || context.name.trim() || text
      const result = await window.hermesAPI.generateEmployeeSoulDraft({
        prompt: hasDraft ? basePrompt : (text || basePrompt),
        name: draft.name.trim() || context.name.trim(),
        displayName: draft.displayName.trim() || context.displayName.trim(),
        style: hasDraft ? undefined : style,
        refinement: hasDraft ? text : '',
        existingSoul: hasDraft ? draft.soul.trim() : '',
      })
      if (!result.success || !result.draft) {
        showToast(translateError(result.error, t) || t('manage.generateFailed'), 'error')
        return
      }
      setDraft({
        name: result.draft.name,
        displayName: result.draft.displayName,
        role: result.draft.role,
        soul: result.draft.soul,
      })
      setInstruction('')
      setGeneratedInSession(true)
    } catch (e: unknown) {
      showToast(translateError((e as Error).message, t) || t('manage.generateFailedCheck'), 'error')
    } finally {
      setGenerating(false)
    }
  }, [context, draft, hasDraft, instruction, soulModelInfo, style, t])

  const handleApply = (): void => {
    if (!draft.soul.trim()) return
    onApply(draft)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void handleGenerate()
    }
  }

  if (!open) return null

  const canSubmit = hasDraft
    ? Boolean(instruction.trim())
    : Boolean(instruction.trim() || context.displayName.trim() || context.name.trim())

  const dialog = (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.5)] backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative glass-heavy border border-[var(--border)] rounded-[var(--radius-xl)] w-[90%] max-w-[640px] animate-scale-in shadow-[0_24px_80px_rgba(0,0,0,0.4)] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 border-b border-[var(--border)] h-14 shrink-0">
          <h3 className="text-[17px] font-semibold tracking-[-0.2px] flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--accent)]" />
            {t('manage.generateSoulTitle')}
          </h3>
          <button type="button" onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{t('manage.soulResultLabel')}</label>
            {hasDraft ? (
              <pre className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] p-3.5 text-xs text-[var(--text-primary)] min-h-[220px] max-h-[320px] overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                {draft.soul}
              </pre>
            ) : (
              <div className="w-full glass-medium border border-dashed border-[var(--border)] rounded-[var(--radius)] p-6 min-h-[220px] flex items-center justify-center text-center">
                <p className="text-sm text-[var(--text-dim)] leading-relaxed max-w-[360px]">{t('manage.soulResultEmpty')}</p>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="text-sm text-[var(--text-secondary)] font-medium">{t('manage.soulInstructionLabel')}</label>
              {!hasDraft && (
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="h-8 glass-medium border border-[var(--border)] rounded-[var(--radius)] px-2 text-xs text-[var(--text-primary)] outline-none bg-[var(--bg-surface)] cursor-pointer"
                >
                  {soulStyles.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
            </div>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasDraft ? t('manage.soulInstructionRefinePlaceholder') : t('manage.soulInstructionPlaceholder')}
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none resize-none min-h-[88px] focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            />
            {hasDraft && (
              <div className="mt-2 flex flex-wrap gap-2">
                {soulPrompts.map(option => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setInstruction(option.value)}
                    disabled={generating}
                    className="rounded-[var(--radius)] border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 cursor-pointer"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-[var(--text-dim)]">
              <p>
                {hasDraft ? t('manage.soulInstructionRefineHint') : t('manage.soulInstructionHint')}
              </p>
              <span className="shrink-0">{t('manage.charCount', { count: instruction.length })}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--border)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !canSubmit}
            className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 cursor-pointer"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generating ? t('common.generating') : (hasDraft ? t('manage.soulAdjustAction') : t('common.generate'))}
          </button>
          {generatedInSession && (
            <button
              type="button"
              onClick={handleApply}
              disabled={!draft.soul.trim()}
              className="flex items-center gap-1.5 rounded-[var(--radius)] bg-accent-gradient px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {t('manage.applySoulDraft')}
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
