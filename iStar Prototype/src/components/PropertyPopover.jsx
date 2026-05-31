import { useState, useRef, useEffect } from 'react'
import useStore from '../store/useStore.js'
import { useZoom, worldToScreen } from '../contexts/ZoomContext.jsx'

const NODE_TYPES = ['goal', 'task', 'softgoal', 'resource']
const LINK_TYPES = [
  'depends-on',
  'or', 'xor', 'and',
  'help', 'hurt', 'make', 'break',
  'needed-by', 'part-of',
]

export default function PropertyPopover() {
  const { selectedId, selectedType, nodes, links, actors,
    updateNode, updateLink, deleteNode, deleteLink, reverseLink, ensureActor, deselect } = useStore()
  const selectedIds = useStore(s => s.selectedIds)
  const { transform } = useZoom()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const handleRef = useRef(null)
  const dragStateRef = useRef(null)

  useEffect(() => { setDragOffset({ x: 0, y: 0 }) }, [selectedId, selectedIds.length])

  const onDragDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    handleRef.current.setPointerCapture(e.pointerId)
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX - dragOffset.x,
      startY: e.clientY - dragOffset.y,
    }
  }
  const onDragMove = (e) => {
    if (!dragStateRef.current || e.pointerId !== dragStateRef.current.pointerId) return
    setDragOffset({ x: e.clientX - dragStateRef.current.startX, y: e.clientY - dragStateRef.current.startY })
  }
  const onDragUp = (e) => {
    if (!dragStateRef.current || e.pointerId !== dragStateRef.current.pointerId) return
    handleRef.current.releasePointerCapture(e.pointerId)
    dragStateRef.current = null
  }

  if (!selectedId && selectedIds.length === 0) return null

  // ── Multi-select popup ───────────────────────────────────────────────────────
  if (selectedIds.length > 1) {
    const selectedNodes = selectedIds.map(id => nodes[id]).filter(Boolean)
    if (selectedNodes.length === 0) return null

    const minX = Math.min(...selectedNodes.map(n => n.x))
    const maxX = Math.max(...selectedNodes.map(n => n.x + n.width))
    const minY = Math.min(...selectedNodes.map(n => n.y))
    const maxY = Math.max(...selectedNodes.map(n => n.y + n.height))
    const { x: cx, y: cy } = worldToScreen((minX + maxX) / 2, (minY + maxY) / 2, transform)

    const actorIds = [...new Set(selectedNodes.map(n => n.actorId))]
    const commonActorName = actorIds.length === 1 && actorIds[0]
      ? actors[actorIds[0]]?.name ?? '' : ''
    const actorNames = Object.values(actors).map(a => a.name)

    const handleMultiActorChange = (e) => {
      const name = e.target.value.trim()
      const actorId = name ? ensureActor(name) : null
      for (const id of selectedIds) updateNode(id, { actorId })
    }

    return (
      <div style={{
        ...popoverStyle(cx + dragOffset.x, cy + dragOffset.y),
        transform: 'translate(-50%, -50%)',
        paddingTop: 20,
      }}>
        <div
          ref={handleRef}
          onPointerDown={onDragDown} onPointerMove={onDragMove}
          onPointerUp={onDragUp} onPointerCancel={onDragUp}
          style={dragHandleStyle}
        >
          <span style={{ fontSize: 8, color: '#ccc', letterSpacing: 3 }}>• • •</span>
        </div>
        <div style={{ fontSize: 9, color: '#aaa', marginBottom: 2, fontFamily: 'monospace' }}>
          {selectedIds.length} elements selected
        </div>
        <label style={labelStyle}>actor</label>
        <input
          key={selectedIds.join(',')}
          list="actor-list-multi"
          defaultValue={commonActorName}
          onBlur={handleMultiActorChange}
          style={inputStyle}
          placeholder={actorIds.length > 1 ? 'mixed…' : 'actor name…'}
        />
        <datalist id="actor-list-multi">
          {actorNames.map(n => <option key={n} value={n} />)}
        </datalist>
      </div>
    )
  }

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

        <button
          onClick={() => updateLink(selectedId, { outerRoute: !link.outerRoute, outerRouteSide: null })}
          style={{ ...btnStyle(link.outerRoute ? '#1a7' : '#555'), marginTop: 2 }}
        >
          {link.outerRoute ? 'route: outer [on]' : 'route: outer'}
        </button>

        {link.outerRoute && (
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            {['left', 'right', 'top', 'bottom'].map(side => (
              <button
                key={side}
                onClick={() => updateLink(selectedId, {
                  outerRouteSide: link.outerRouteSide === side ? null : side,
                })}
                style={btnStyle(link.outerRouteSide === side ? '#1a7' : '#888')}
              >
                {side}
              </button>
            ))}
          </div>
        )}

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

  const GAP = 20
  const { x: sx, y: sy } = worldToScreen(node.x + node.width / 2, node.y, transform)
  const connDx = GAP - dragOffset.x
  const connDy = GAP - dragOffset.y

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
      ...popoverStyle(sx - GAP + dragOffset.x, sy - GAP + dragOffset.y),
      transform: 'translate(-100%, -100%)',
      paddingTop: 20,
    }}>
      <div
        ref={handleRef}
        onPointerDown={onDragDown} onPointerMove={onDragMove}
        onPointerUp={onDragUp} onPointerCancel={onDragUp}
        style={dragHandleStyle}
      >
        <span style={{ fontSize: 8, color: '#ccc', letterSpacing: 3 }}>• • •</span>
      </div>
      <button onClick={deselect} onPointerDown={e => e.stopPropagation()} style={closeBtnStyle}>×</button>
      <svg style={{ position: 'absolute', bottom: 0, right: 0, width: 0, height: 0, overflow: 'visible', pointerEvents: 'none' }}>
        <line x1={0} y1={0} x2={connDx} y2={connDy} stroke="#bbb" strokeWidth={1} />
        <circle cx={connDx} cy={connDy} r={2} fill="#aaa" />
      </svg>
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
  background: 'var(--bg-popup)',
  border: '1px solid var(--border-md)',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  zIndex: 100,
  minWidth: 160,
})

const labelStyle = { fontSize: 9, color: 'var(--text-2)', marginTop: 2 }

const inputStyle = {
  font: 'inherit',
  fontSize: 11,
  border: '1px solid var(--border)',
  padding: '2px 4px',
  width: '100%',
  background: 'var(--node-fill)',
  color: 'var(--text-1)',
}

const dragHandleStyle = {
  position: 'absolute', top: 0, left: 0, right: 0, height: 16,
  cursor: 'grab',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderBottom: '1px solid #eee',
  userSelect: 'none',
}

const closeBtnStyle = {
  position: 'absolute',
  top: 4,
  right: 6,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  color: 'var(--text-2)',
  lineHeight: 1,
  padding: 0,
}

const btnStyle = (color) => ({
  background: 'none',
  border: `1px solid ${color}`,
  color,
  padding: '2px 6px',
  cursor: 'pointer',
  fontSize: 10,
  fontFamily: 'monospace',
})
