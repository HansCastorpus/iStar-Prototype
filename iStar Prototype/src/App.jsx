import { useEffect } from 'react'
import Canvas from './components/Canvas.jsx'
import Toolbar from './components/Toolbar.jsx'
import FilterPanel from './components/FilterPanel.jsx'
import LegendPanel from './components/LegendPanel.jsx'
import useStore from './store/useStore.js'

export default function App() {
  const darkMode = useStore(s => s.darkMode)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <Toolbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <FilterPanel />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Canvas />
        </div>
        <LegendPanel />
      </div>
    </div>
  )
}
