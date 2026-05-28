import { useState } from 'react'
import useStore from '../store/useStore.js'
import { useZoom, worldToScreen } from '../contexts/ZoomContext.jsx'

const NODE_TYPES = ['goal', 'task', 'softgoal', 'resource']
const LINK_TYPES = ['dependency', 'means-end', 'decomposition', 'contribution']

export default function PropertyPopover() {
  const { selectedId, selectedType, nodes, links, actors,
    updateNode, updateLink, deleteNode, deleteLink, reverseLink, ensureActor } = useStore()
  const selectedIds = useStore(s => s.selectedIds)
  const { transform } = useZoom()
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!selectedId || selectedIds.length > 1) return null

  if (selectedType === 'link') {
    const link = links[selectedId]
    if (!link) return null
    const src = nodes[link.sourceId], tgt = nodes[link.targetId]
    if (!src || !tgt) return null
    const { x: lx, y: ly } = worldToScreen(
      (src.x + src.width / 2 + tgt.x + tgt.width / 2) / 2,
      (src.y + src.height / 2 + tgt.y + tgt.height / 2) / 2,
      transform,
    )
    return (
      <div style={popoverStyle(lx - 150, ly - 150)}>
        <label style={labelStyle}>type</label>
        <select
          value={link.type}
          onChange={e => updateLink(selectedId, { type: e.target.value })}
          style={inputStyle}
        >
          {LINK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <button
          onClick={() => reverseLink(selectedId)}
          style={{ ...btnStyle('#555'), marginTop: 4 }}
        >
          reverse direction
        </button>

        <div style={{ marginTop: 4 }}>
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => deleteLink(selectedId)} style={btnStyle('#c00')}>delete</button>
              <button onClick={() => setConfirmDelete(false)} style={btnStyle('#888')}>cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={btnStyle('#c00')}>
              delete link
            </button>
          )}
        </div>
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
      ...popoverStyle(sx - 250, sy - 250),
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
