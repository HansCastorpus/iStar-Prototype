import { useState } from 'react'
import useStore from '../store/useStore.js'
import { useZoom, worldToScreen } from '../contexts/ZoomContext.jsx'

const NODE_TYPES = ['goal', 'task', 'softgoal', 'resource']

export default function PropertyPopover() {
  const { selectedId, selectedType, nodes, links, actors,
          updateNode, deleteNode, deleteLink, ensureActor } = useStore()
  const { transform } = useZoom()
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!selectedId) return null

  if (selectedType === 'link') {
    const link = links[selectedId]
    if (!link) return null
    return (
      <div style={popoverStyle(200, 80)}>
        <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>
          link: <strong>{link.type}</strong>
        </div>
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => deleteLink(selectedId)} style={btnStyle('#c00')}>
              delete
            </button>
            <button onClick={() => setConfirmDelete(false)} style={btnStyle('#888')}>
              cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={btnStyle('#c00')}>
            delete link
          </button>
        )}
      </div>
    )
  }

  const node = nodes[selectedId]
  if (!node) return null

  const { x: sx, y: sy } = worldToScreen(
    node.x + node.width / 2,
    node.y + node.height + 8,
    transform,
  )

  const actorName = node.actorId ? actors[node.actorId]?.name ?? '' : ''
  const actorNames = Object.values(actors).map((a) => a.name)

  const handleLabelChange = (e) => {
    updateNode(node.id, { label: e.target.value })
  }

  const handleTypeChange = (e) => {
    updateNode(node.id, { type: e.target.value })
  }

  const handleActorChange = (e) => {
    const name = e.target.value.trim()
    if (!name) {
      updateNode(node.id, { actorId: null })
      return
    }
    const actorId = ensureActor(name)
    updateNode(node.id, { actorId })
  }

  return (
    <div style={{
      ...popoverStyle(sx, sy),
      transform: 'translateX(-50%)',
    }}>
      <label style={labelStyle}>label</label>
      <input
        autoFocus
        value={node.label}
        onChange={handleLabelChange}
        style={inputStyle}
        placeholder="enter label…"
      />

      <label style={labelStyle}>type</label>
      <select value={node.type} onChange={handleTypeChange} style={inputStyle}>
        {NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <label style={labelStyle}>actor</label>
      <input
        list="actor-list"
        defaultValue={actorName}
        onBlur={handleActorChange}
        style={inputStyle}
        placeholder="actor name…"
      />
      <datalist id="actor-list">
        {actorNames.map((n) => <option key={n} value={n} />)}
      </datalist>

      <div style={{ marginTop: 6 }}>
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => deleteNode(node.id)} style={btnStyle('#c00')}>
              confirm delete
            </button>
            <button onClick={() => setConfirmDelete(false)} style={btnStyle('#888')}>
              cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={btnStyle('#c00')}>
            delete node
          </button>
        )}
      </div>
    </div>
  )
}

const popoverStyle = (x, y) => ({
  position: 'absolute',
  left: x,
  top: y,
  background: '#fff',
  border: '1px solid #ccc',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  zIndex: 100,
  minWidth: 160,
  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
})

const labelStyle = { fontSize: 9, color: '#999', marginTop: 2 }

const inputStyle = {
  font: 'inherit',
  fontSize: 11,
  border: '1px solid #ddd',
  padding: '2px 4px',
  width: '100%',
}

const btnStyle = (color) => ({
  background: 'none',
  border: `1px solid ${color}`,
  color,
  padding: '2px 6px',
  cursor: 'pointer',
  fontSize: 10,
})
