import { useState, useEffect } from 'react'
import { ThemeProvider } from './components/ThemeProvider'
import Login from './screens/Login/Login'
import Layout from './screens/Layout/Layout'
import Onboarding from './screens/Onboarding/Onboarding'

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

export default function App(): React.ReactElement {
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!window.hermesAPI) {
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
  }, [])

  useEffect(() => {
    if (!window.hermesAPI?.onCronSessionCreated) return
    return window.hermesAPI.onCronSessionCreated((data) => {
      showToast(`日程执行完成：${data.title || data.sessionId}`, 'success')
    })
  }, [])

  const handleLoginSuccess = (): void => {
    setScreen('main')
  }

  const handleLogout = (): void => {
    setScreen('login')
  }

  const handleOnboardingComplete = (): void => {
    setScreen('main')
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <span className="text-sm text-[var(--text-dim)]">Loading 落云.Hermes...</span>
        </div>
      </div>
    )
  }

  return (
    <ThemeProvider>
      {screen === 'onboarding' ? (
        <Onboarding onComplete={handleOnboardingComplete} />
      ) : screen === 'login' ? (
        <Login onSuccess={handleLoginSuccess} />
      ) : (
        <Layout onLogout={handleLogout} />
      )}
      <div id="toastContainer" />
    </ThemeProvider>
  )
}
