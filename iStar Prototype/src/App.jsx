import { useEffect } from 'react'
import Canvas from './components/Canvas.jsx'
import Toolbar from './components/Toolbar.jsx'
import FilterPanel from './components/FilterPanel.jsx'
import useStore from './store/useStore.js'

export default function App() {
  const darkMode = useStore(s => s.darkMode)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const lang = useStore(s => s.lang)
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  // Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z or Ctrl+Y redo. Text fields keep their own native undo.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const el = e.target
      if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      const key = e.key.toLowerCase()
      const { undo, redo } = useStore.getState()
      if (key === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)() }
      else if (key === 'y' && !e.shiftKey) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <Toolbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <FilterPanel />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Canvas />
        </div>
      </div>
    </div>
  )
}
