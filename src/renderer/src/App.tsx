import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { I18nProvider } from './components/I18nProvider'
import { ThemeProvider } from './components/ThemeProvider'
import { RemoteConnectionProvider } from './components/RemoteConnectionProvider'
import Login from './screens/Login/Login'
import Layout from './screens/Layout/Layout'
import Onboarding from './screens/Onboarding/Onboarding'
import logoImg from './assets/logo.png'

type Screen = 'onboarding' | 'login' | 'main'

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const container = document.getElementById('toastContainer')
  if (!container) return
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  container.appendChild(toast)
  requestAnimationFrame(() => {
    toast.classList.add('visible')
  })
  setTimeout(() => {
    toast.classList.remove('visible')
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

function AppContent(): React.ReactElement {
  const { t } = useTranslation()
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const onDeploymentChanged = (): void => {
      setScreen('onboarding')
      setLoading(false)
    }
    window.addEventListener('hermes:deployment-changed', onDeploymentChanged)
    return () => window.removeEventListener('hermes:deployment-changed', onDeploymentChanged)
  }, [])

  useEffect(() => {
    if (!window.hermesAPI) {
      setScreen('onboarding')
      setLoading(false)
      return
    }
    window.hermesAPI.getDeploymentMode().then((mode) => {
      if (!mode) {
        setScreen('onboarding')
        setLoading(false)
        return
      }
      window.hermesAPI.checkInitialized().then((initialized) => {
        if (initialized) {
          window.hermesAPI.authGetCurrent().then((result) => {
            if (result) {
              setScreen('main')
            } else {
              setScreen('login')
            }
            setLoading(false)
          }).catch(() => {
            setScreen('login')
            setLoading(false)
          })
        } else {
          setScreen('onboarding')
          setLoading(false)
        }
      }).catch(() => {
        setScreen('onboarding')
        setLoading(false)
      })
    }).catch(() => {
      setScreen('onboarding')
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!window.hermesAPI?.onCronSessionCreated) return
    return window.hermesAPI.onCronSessionCreated((data) => {
      showToast(t('app.cronDone', { title: data.title || data.sessionId }), 'success')
    })
  }, [t])

  const handleLoginSuccess = (): void => {
    setScreen('main')
  }

  const handleLogout = (): void => {
    setScreen('login')
  }

  const handleOnboardingComplete = (): void => {
    setScreen('main')
  }

  return (
    <ThemeProvider>
      <RemoteConnectionProvider>
        {loading ? (
          <div className="flex h-screen items-center justify-center relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse 70% 50% at 50% 45%, rgba(124,106,239,0.12), transparent 70%), radial-gradient(ellipse 50% 40% at 30% 60%, rgba(91,141,239,0.06), transparent 60%)'
            }} />
            <div className="relative flex flex-col items-center gap-5 animate-scale-in">
              <div className="w-20 h-20 rounded-2xl overflow-hidden" style={{ boxShadow: '0 8px 40px rgba(124,106,239,0.25), 0 2px 8px rgba(0,0,0,0.3)' }}>
                <img src={logoImg} alt={t('app.name')} className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-lg font-semibold text-accent-gradient" style={{ letterSpacing: '-0.3px' }}>{t('app.name')}</span>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                  <span className="text-xs text-[var(--text-dim)]">{t('app.initializing')}</span>
                </div>
              </div>
            </div>
          </div>
        ) : screen === 'onboarding' ? (
          <Onboarding onComplete={handleOnboardingComplete} />
        ) : screen === 'login' ? (
          <Login onSuccess={handleLoginSuccess} />
        ) : (
          <Layout onLogout={handleLogout} />
        )}
        <div id="toastContainer" />
      </RemoteConnectionProvider>
    </ThemeProvider>
  )
}

export default function App(): React.ReactElement {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  )
}
