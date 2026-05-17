import { useState, useEffect } from 'react'
import { ThemeProvider } from './components/ThemeProvider'
import Login from './screens/Login/Login'
import Layout from './screens/Layout/Layout'

type Screen = 'login' | 'main'

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
  const [screen, setScreen] = useState<Screen>('login')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
  }, [])

  const handleLoginSuccess = (): void => {
    setScreen('main')
  }

  const handleLogout = (): void => {
    setScreen('login')
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <span className="text-sm text-[var(--text-dim)]">Loading Hermes...</span>
        </div>
      </div>
    )
  }

  return (
    <ThemeProvider>
      {screen === 'login' ? (
        <Login onSuccess={handleLoginSuccess} />
      ) : (
        <Layout onLogout={handleLogout} />
      )}
      <div id="toastContainer" />
    </ThemeProvider>
  )
}
