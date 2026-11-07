import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Home from './pages/Home'
import Recipe from './pages/Recipe'
import Clinic from './pages/Clinic'
import Walk from './pages/Walk'
import WalkTrack from './pages/WalkTrack'
import Radar from './pages/Radar'
import Community from './pages/Community'
import Groom from './pages/Groom'

/** 全局快捷键：Esc 返回首页（输入框聚焦时不响应，避免打断输入） */
function GlobalShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (location.pathname !== '/') {
        e.preventDefault()
        navigate('/')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, location.pathname])
  return null
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <GlobalShortcuts />
        <div className="min-h-screen bg-gradient-to-b from-sky-100 via-white to-emerald-100 text-slate-800">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/recipe" element={<Recipe />} />
            <Route path="/clinic" element={<Clinic />} />
            <Route path="/walk" element={<Walk />} />
            <Route path="/walk/track" element={<WalkTrack />} />
            <Route path="/radar" element={<Radar />} />
            <Route path="/community" element={<Community />} />
            <Route path="/groom" element={<Groom />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
