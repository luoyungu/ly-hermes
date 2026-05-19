import { ExternalLink, Server, Database, Code2 } from 'lucide-react'
import { usePlatform } from '../../hooks/usePlatform'
import logoImg from '../../assets/logo.png'
import { useTheme } from '../../components/ThemeProvider'

export default function About(): React.ReactElement {
  const { isMac } = usePlatform()
  const { lexicon } = useTheme()
  return (
    <div className="flex h-full flex-col">
      <div className="screen-header drag-region flex items-center border-b border-[var(--border)] glass-medium shrink-0" style={{ paddingTop: isMac ? 20 : 0, paddingBottom: isMac ? 20 : 0 }}>
        <h2 className="screen-header-title">{lexicon.nav.about}</h2>
      </div>
      <div className="flex flex-1 items-center justify-center">
      <div className="animate-fade-in text-center">
        <img src={logoImg} alt="落云.Hermes" className="mx-auto mb-5 w-28 h-28 rounded-2xl" style={{ filter: 'drop-shadow(0 0 16px rgba(124,106,239,0.25))' }} />
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">落云.Hermes</h1>
        <p className="mt-1 text-sm text-[var(--text-dim)]">v1.0.0</p>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
          {lexicon.appSubtitle}
        </p>

        <div className="mt-8 mx-auto max-w-sm space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-left">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-glow)]">
              <img src={logoImg} alt="" className="w-7 h-7" />
            </div>
            <div>
              <div className="text-xs text-[var(--text-dim)]">技术栈</div>
              <div className="text-sm text-[var(--text-primary)]">Electron + React 19 + TypeScript</div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-left">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-glow)]">
              <Database size={18} className="text-[var(--accent)]" />
            </div>
            <div>
              <div className="text-xs text-[var(--text-dim)]">数据库</div>
              <div className="text-sm text-[var(--text-primary)]">SQLite (per profile)</div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-left">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-glow)]">
              <Server size={18} className="text-[var(--accent)]" />
            </div>
            <div>
              <div className="text-xs text-[var(--text-dim)]">API</div>
              <div className="text-sm text-[var(--text-primary)]">OpenAI Compatible</div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-left">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-glow)]">
              <Code2 size={18} className="text-[var(--accent)]" />
            </div>
            <div>
              <div className="text-xs text-[var(--text-dim)]">构建工具</div>
              <div className="text-sm text-[var(--text-primary)]">electron-vite + Tailwind CSS 4</div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {['Electron', 'React 19', 'TypeScript', 'electron-vite', 'Tailwind CSS 4', 'Vite', 'SQLite'].map(
            (tech) => (
              <span
                key={tech}
                className="rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs text-[var(--text-dim)]"
              >
                {tech}
              </span>
            )
          )}
        </div>

        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 text-xs text-[var(--text-dim)] transition-colors hover:text-[var(--accent)]"
        >
          <ExternalLink size={12} /> GitHub
        </a>
      </div>
      </div>
    </div>
  )
}
