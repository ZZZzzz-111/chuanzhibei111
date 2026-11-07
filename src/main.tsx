import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('挂载节点 #root 未找到，请检查 index.html')
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
