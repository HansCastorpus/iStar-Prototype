import Canvas from './components/Canvas.jsx'
import Toolbar from './components/Toolbar.jsx'

export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <Toolbar />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Canvas />
      </div>
    </div>
  )
}
