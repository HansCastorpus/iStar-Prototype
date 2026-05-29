import useStore from '../store/useStore.js'
import { useZoom, worldToScreen } from '../contexts/ZoomContext.jsx'

const LINK_TYPES = [
  'depends-on',
  'or', 'xor', 'and',
  'help', 'hurt', 'make', 'break',
  'needed-by', 'part-of',
]

export default function LinkTypePopup() {
  const { pendingLink, nodes, confirmLink, clearConnect } = useStore()
  const { transform } = useZoom()

  if (!pendingLink) return null

  const src = nodes[pendingLink.sourceId]
  const tgt = nodes[pendingLink.targetId]
  if (!src || !tgt) return null

  const worldMidX = (src.x + src.width / 2 + tgt.x + tgt.width / 2) / 2
  const worldMidY = (src.y + src.height / 2 + tgt.y + tgt.height / 2) / 2
  const { x: sx, y: sy } = worldToScreen(worldMidX, worldMidY, transform)

  return (
    <div style={{
      position: 'absolute',
      left: sx,
      top: sy,
      transform: 'translate(-50%, -50%)',
      background: '#fff',
      border: '1px solid #ccc',
      padding: '6px',
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
      zIndex: 100,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    }}>
      <div style={{ fontSize: 9, color: '#999', marginBottom: 2 }}>link type</div>
      {LINK_TYPES.map((type) => (
        <button
          key={type}
          onClick={() => confirmLink(type)}
          style={{
            background: 'none',
            border: '1px solid #ccc',
            padding: '3px 8px',
            cursor: 'pointer',
            fontSize: 11,
            textAlign: 'left',
          }}
        >
          {type}
        </button>
      ))}
      <button
        onClick={clearConnect}
        style={{ background: 'none', border: 'none', color: '#999',
          cursor: 'pointer', fontSize: 10, marginTop: 2 }}
      >
        cancel
      </button>
    </div>
  )
}
