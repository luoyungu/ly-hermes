import { useState, useCallback } from 'react'
import { MessageSquare, Settings, Info, LogOut, Palette, Users, Calendar } from 'lucide-react'
import logoImg from '../../assets/logo.png'
import Chat from '../Chat/Chat'
import SettingsScreen from '../Settings/Settings'
import About from '../About/About'
import Appearance from '../Appearance/Appearance'
import Manage from '../Manage/Manage'
import Schedule from '../Schedule/Schedule'
import WindowControls from '../../components/WindowControls'

type ViewId = 'chat' | 'manage' | 'schedule' | 'appearance' | 'settings' | 'about'

interface NavItem {
  id: ViewId
  icon: React.ReactNode
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'chat', icon: <MessageSquare size={22} />, label: '对话' },
  { id: 'manage', icon: <Users size={22} />, label: '管理' },
  { id: 'schedule', icon: <Calendar size={22} />, label: '日程' },
  { id: 'appearance', icon: <Palette size={22} />, label: '外观' },
  { id: 'settings', icon: <Settings size={22} />, label: '设置' },
  { id: 'about', icon: <Info size={22} />, label: '关于' }
]

interface LayoutProps {
  onLogout: () => void
}

export default function Layout({ onLogout }: LayoutProps): React.ReactElement {
  const [currentView, setCurrentView] = useState<ViewId>('chat')
  const [visitedViews, setVisitedViews] = useState(() => new Set<ViewId>(['chat']))

  const handleNavClick = useCallback((id: ViewId) => {
    setVisitedViews(new Set([...visitedViews, id]))
    setCurrentView(id)
  }, [visitedViews])

  const handleLogout = useCallback(async () => {
    try {
      await window.hermesAPI.authLogout()
    } catch {
      /* ignore */
    }
    onLogout()
  }, [onLogout])

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] relative">
      <div id="wallpaperLayer" className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-opacity duration-500 pointer-events-none" style={{ opacity: 0 }} />
      <div id="wallpaperOverlay" className="fixed inset-0 z-0 bg-[var(--bg-primary)] pointer-events-none" style={{ opacity: 0 }} />
      <aside className="flex w-[80px] min-w-[80px] flex-col items-center glass-medium border-r border-[var(--border)] z-10 relative" style={{ paddingTop: 40, paddingBottom: 16 }}>
        <img src={logoImg} alt="落云.Hermes" className="w-14 h-14 mb-4 rounded-lg" style={{ filter: 'drop-shadow(0 0 8px rgba(124,106,239,0.25))' }} />
        <nav className="flex flex-1 flex-col items-center gap-1.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`flex flex-col items-center gap-1.5 w-16 rounded-[var(--radius)] cursor-pointer transition-all relative ${
                currentView === item.id
                  ? 'text-[var(--accent)] bg-[var(--accent-glow)]'
                  : 'text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
              style={{ padding: '10px 0' }}
            >
              {currentView === item.id && (
                <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-sm bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
              )}
              {item.icon}
              <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1 }}>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={handleLogout}
            title="退出登录"
            className="flex flex-col items-center gap-1.5 w-16 rounded-[var(--radius)] cursor-pointer transition-all text-[var(--text-dim)] hover:text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)]"
            style={{ padding: '10px 0' }}
          >
            <LogOut size={22} />
            <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1 }}>退出</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden relative z-10 glass-medium flex flex-col">
        <div className="drag-region flex items-center justify-end shrink-0 h-9 border-b border-[var(--border)] bg-[var(--bg-surface)]">
          <WindowControls />
        </div>
        <div className="flex-1 overflow-hidden relative">
        {visitedViews.has('chat') && (
          <div className={`h-full ${currentView === 'chat' ? '' : 'hidden'}`}>
            <Chat />
          </div>
        )}
        {visitedViews.has('manage') && (
          <div className={`h-full ${currentView === 'manage' ? '' : 'hidden'}`}>
            <Manage />
          </div>
        )}
        {visitedViews.has('schedule') && (
          <div className={`h-full ${currentView === 'schedule' ? '' : 'hidden'}`}>
            <Schedule />
          </div>
        )}
        {visitedViews.has('appearance') && (
          <div className={`h-full ${currentView === 'appearance' ? '' : 'hidden'}`}>
            <Appearance />
          </div>
        )}
        {visitedViews.has('settings') && (
          <div className={`h-full ${currentView === 'settings' ? '' : 'hidden'}`}>
            <SettingsScreen />
          </div>
        )}
        {visitedViews.has('about') && (
          <div className={`h-full ${currentView === 'about' ? '' : 'hidden'}`}>
            <About />
          </div>
        )}
        </div>
      </main>
    </div>
  )
}
