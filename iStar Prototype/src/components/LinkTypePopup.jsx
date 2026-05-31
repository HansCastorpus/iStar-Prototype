import { useState, useRef } from 'react'
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
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const handleRef = useRef(null)
  const dragStateRef = useRef(null)

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
      left: sx + dragOffset.x,
      top: sy + dragOffset.y,
      transform: 'translate(-50%, -50%)',
      background: 'var(--bg-popup)',
      border: '1px solid var(--border-md)',
      padding: '6px',
      paddingTop: 22,
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
      zIndex: 100,
    }}>
      <div
        ref={handleRef}
        onPointerDown={onDragDown} onPointerMove={onDragMove}
        onPointerUp={onDragUp} onPointerCancel={onDragUp}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 16,
          cursor: 'grab',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid var(--border-lt)',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: 3 }}>• • •</span>
      </div>

      <div style={{ fontSize: 9, color: 'var(--text-2)', marginBottom: 2 }}>link type</div>
      {LINK_TYPES.map((type) => (
        <button
          key={type}
          onClick={() => confirmLink(type)}
          style={{
            background: 'none',
            border: '1px solid var(--border-md)',
            color: 'var(--text-1)',
            padding: '3px 8px',
            cursor: 'pointer',
            fontSize: 11,
            textAlign: 'left',
            fontFamily: 'monospace',
          }}
        >
          {type}
        </button>
      ))}
      <button
        onClick={clearConnect}
        onPointerDown={e => e.stopPropagation()}
        style={{ background: 'none', border: 'none', color: 'var(--text-2)',
          cursor: 'pointer', fontSize: 10, marginTop: 2, fontFamily: 'monospace' }}
      >
        cancel
      </button>
    </div>
  )
}
