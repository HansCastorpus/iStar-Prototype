import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Wait (briefly) for the UI font, since panel and element widths are measured with it
const fontReady = Promise.race([
  Promise.all(['400', '600', '700'].map(w => document.fonts.load(`${w} 12px "Roboto Mono"`))),
  new Promise(resolve => setTimeout(resolve, 1500)),
])

fontReady.finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
