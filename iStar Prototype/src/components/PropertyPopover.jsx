import { useState } from 'react'
import useStore from '../store/useStore.js'
import { useZoom, worldToScreen } from '../contexts/ZoomContext.jsx'
import { usePopupPlacement, screenBounds, diagramObstacles } from '../utils/usePopupPlacement.js'
import PopupConnector, { POPUP_Z } from './PopupConnector.jsx'

const NODE_TYPES = ['goal', 'task', 'softgoal', 'resource']
const LINK_TYPES = [
  'depends-on',
  'or', 'xor', 'and',
  'help', 'hurt', 'make', 'break',
  'needed-by', 'part-of',
]

const SEL_LINK_WEIGHT = 4 // covering the selected link matters more than other links

// Point halfway along a polyline
function pathMidpoint(points) {
  const segs = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let rest = segs.reduce((s, l) => s + l, 0) / 2
  for (let i = 0; i < segs.length; i++) {
    if (rest <= segs[i]) {
      const t = segs[i] ? rest / segs[i] : 0
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t }
    }
    rest -= segs[i]
  }
  return points[points.length - 1]
}

// The screen rect the popup belongs to, or null when nothing usable is selected
function selectionAnchor({ selectedId, selectedIds, selectedType, nodes, links, linkPaths, transform }) {
  if (selectedIds.length > 1) {
    const sel = selectedIds.map(id => nodes[id]).filter(Boolean)
    return sel.length ? screenBounds(sel, transform) : null
  }
  if (selectedType === 'link') {
    const link = links[selectedId]
    const path = linkPaths[selectedId]
    if (!link) return null
    let mid
    if (path?.length >= 2) mid = pathMidpoint(path)
    else {
      const src = nodes[link.sourceId], tgt = nodes[link.targetId]
      if (!src || !tgt) return null
      mid = { x: (src.x + src.width / 2 + tgt.x + tgt.width / 2) / 2, y: (src.y + src.height / 2 + tgt.y + tgt.height / 2) / 2 }
    }
    const { x, y } = worldToScreen(mid.x, mid.y, transform)
    return { x: x - 8, y: y - 8, w: 16, h: 16 }
  }
  const node = nodes[selectedId]
  return node ? screenBounds([node], transform) : null
}

export default function PropertyPopover({ linkPaths = {} }) {
  const { selectedId, selectedType, nodes, links, actors,
    updateNode, updateLink, deleteNode, deleteLink, reverseLink, ensureActor, deselect } = useStore()
  const selectedIds = useStore(s => s.selectedIds)
  const { transform } = useZoom()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [collapsed, setCollapsed] = useState(false)  // kept across selections so a minimized popup stays out of the way

  const anchor = selectionAnchor({ selectedId, selectedIds, selectedType, nodes, links, linkPaths, transform })
  const { pos, popRef, handleRef, dragProps, connector } = usePopupPlacement({
    id: 'properties',
    anchor,
    getObstacles: () => diagramObstacles({ nodes, linkPaths, transform, weights: { [selectedId]: SEL_LINK_WEIGHT } }),
    resetKey: `${selectedId}|${selectedIds.join(',')}`,
  })

  const header = (onClose) => (
    <PopoverHeader
      handleRef={handleRef}
      dragProps={dragProps}
      collapsed={collapsed}
      onToggle={() => setCollapsed(c => !c)}
      onClose={onClose}
    />
  )

  // Positioned shell shared by all popup variants, with a connector back to the selection
  const frame = (children) => (
    <>
      <PopupConnector connector={connector} pos={pos} />
      <div ref={popRef} style={{ ...popoverStyle(pos.x, pos.y), paddingTop: HEADER_H + 4 }}>
        {children}
      </div>
    </>
  )

  if ((!selectedId && selectedIds.length === 0) || !anchor) return null

  // ── Multi-select popup ───────────────────────────────────────────────────────
  if (selectedIds.length > 1) {
    const selectedNodes = selectedIds.map(id => nodes[id]).filter(Boolean)
    if (selectedNodes.length === 0) return null

    const actorIds = [...new Set(selectedNodes.map(n => n.actorId))]
    const commonActorName = actorIds.length === 1 && actorIds[0]
      ? actors[actorIds[0]]?.name ?? '' : ''
    const actorNames = Object.values(actors).map(a => a.name)

    const handleMultiActorChange = (e) => {
      const name = e.target.value.trim()
      const actorId = name ? ensureActor(name) : null
      for (const id of selectedIds) updateNode(id, { actorId })
    }

    return frame(<>
        {header()}
        <div style={{ fontSize: 9, color: '#aaa', marginBottom: 2, fontFamily: 'monospace' }}>
          {selectedIds.length} elements selected
        </div>
        {!collapsed && <>
        <label style={labelStyle}>actor</label>
        <input
          key={selectedIds.join(',')}
          list="actor-list-multi"
          defaultValue={commonActorName}
          onBlur={handleMultiActorChange}
          onKeyDown={confirmOnEnter}
          style={inputStyle}
          placeholder={actorIds.length > 1 ? 'mixed…' : 'actor name…'}
        />
        <datalist id="actor-list-multi">
          {actorNames.map(n => <option key={n} value={n} />)}
        </datalist>
        </>}
    </>)
  }

  if (selectedType === 'link') {
    const link = links[selectedId]
    if (!link) return null
    return frame(<>
        {header()}
        {collapsed ? (
          <div style={summaryStyle}>{link.type}</div>
        ) : <>
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
        </>}
    </>)
  }

  const node = nodes[selectedId]
  if (!node) return null

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

  return frame(<>
      {header(deselect)}
      {collapsed ? (
        <div style={summaryStyle}>{node.label || node.type}</div>
      ) : <>
      <label style={labelStyle}>label</label>
      <input
        autoFocus
        value={node.label}
        onChange={handleLabelChange}
        onKeyDown={confirmOnEnter}
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
        onKeyDown={confirmOnEnter}
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
      </>}
  </>)
}

// Enter confirms a text field by leaving it (actor fields save on blur; labels save as you type).
// Deferred so a highlighted autocomplete suggestion is filled in first; skipped mid-IME composition.
function confirmOnEnter(e) {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
  const el = e.currentTarget
  setTimeout(() => el.blur())
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
  zIndex: POPUP_Z,
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

const HEADER_H = 22

// Header bar: drag handle across the top, with a hide/show toggle (and optional ×) on the right
function PopoverHeader({ handleRef, dragProps, collapsed, onToggle, onClose }) {
  const stop = e => e.stopPropagation()
  return (
    <>
      <div ref={handleRef} {...dragProps} style={dragHandleStyle}>
        <span style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: 3 }}>• • •</span>
      </div>
      <div style={headerActionsStyle}>
        <button onClick={onToggle} onPointerDown={stop} style={toggleBtnStyle}>
          {collapsed ? 'show' : 'hide'}
        </button>
        {onClose && <button onClick={onClose} onPointerDown={stop} style={closeBtnStyle}>×</button>}
      </div>
    </>
  )
}

const headerActionsStyle = {
  position: 'absolute', top: 0, right: 4, height: HEADER_H,
  display: 'flex', alignItems: 'center', gap: 6,
}

const toggleBtnStyle = {
  background: 'var(--node-fill)',
  border: '1px solid var(--border-md)',
  color: 'var(--text-1)',
  padding: '1px 6px',
  cursor: 'pointer',
  fontSize: 9,
  fontFamily: 'monospace',
  lineHeight: 1.3,
}

const summaryStyle = {
  fontSize: 10, color: 'var(--text-1)', fontFamily: 'monospace',
  maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

const dragHandleStyle = {
  position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_H,
  cursor: 'grab',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderBottom: '1px solid var(--border-lt)',
  userSelect: 'none',
}

const closeBtnStyle = {
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
