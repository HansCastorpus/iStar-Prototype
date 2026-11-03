import { useEffect, useState } from 'react'
import Canvas from './components/Canvas.jsx'
import Toolbar, { Logo } from './components/Toolbar.jsx'
import FilterPanel from './components/FilterPanel.jsx'
import TabBar from './components/TabBar.jsx'
import WorkTitle from './components/WorkTitle.jsx'
import useStore from './store/useStore.js'

export default function App() {
  const darkMode = useStore(s => s.darkMode)
  const activeModelId = useStore(s => s.activeModelId)
  const filterPanelRight = useStore(s => s.filterPanelRight)
  const filterCollapsed = useStore(s => s.filterCollapsed)

  // The logo keeps the width it had over the open filter panel, so it stays visible when that collapses
  const [logoWidth, setLogoWidth] = useState(300)
  useEffect(() => { if (!filterCollapsed && filterPanelRight) setLogoWidth(filterPanelRight) }, [filterCollapsed, filterPanelRight])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // Load the saved project once (not per diagram: the canvas is remounted when another diagram opens)
  useEffect(() => { useStore.getState().loadFromStorage() }, [])

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
      {/* Header: the logo has one container over the filter panel, spanning both rows; the toolbar and
          tab bar stack to its right */}
      <div style={{ display: 'flex', flexShrink: 0 }}>
        <div style={{
          width: filterCollapsed ? logoWidth : filterPanelRight ?? 300, flexShrink: 0, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8px 16px', background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        }}>
          <Logo />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Toolbar />
          <TabBar />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <FilterPanel />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* keyed by the open diagram so each one starts with a fresh view (zoom / pan) */}
          <Canvas key={activeModelId} />
          <WorkTitle />
        </div>
      </div>
    </div>
  )
}
