import Canvas from './components/Canvas.jsx'
import Toolbar from './components/Toolbar.jsx'
import FilterPanel from './components/FilterPanel.jsx'

export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <Toolbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <FilterPanel />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Canvas />
        </div>
      </div>
    </div>
  )
}
