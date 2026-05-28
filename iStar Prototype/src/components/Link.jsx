import { useRef, useState } from 'react'
import useStore from '../store/useStore.js'
import { useZoom } from '../contexts/ZoomContext.jsx'
import { pointsToPath, getPointAtT, projectOntoPath } from '../utils/routing.js'

const PAD_X = 6
const PAD_Y = 3
const FONT_SIZE = 10
const CHAR_W = 5.8  // approximate px per char at 10px sans-serif

export default function Link({ link, points }) {
  const labelRef  = useRef(null)
  const pointerRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const { selectedId, select, deleteLink, updateLink } = useStore()
  const { transformRef } = useZoom()

  if (!points || points.length < 2) return null

  const d   = pointsToPath(points)
  const t   = link.labelT ?? 0.5
  const pos = getPointAtT(points, t)
  const isSelected = selectedId === link.id

  const clientToWorld = (cx, cy) => {
    const rect = labelRef.current.ownerSVGElement.getBoundingClientRect()
    const tr   = transformRef.current
    return {
      x: (cx - rect.left - tr.x) / tr.k,
      y: (cy - rect.top  - tr.y) / tr.k,
    }
  }

  const onLabelPointerDown = (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    labelRef.current.setPointerCapture(e.pointerId)
    pointerRef.current = { pointerId: e.pointerId, moved: false }
    setDragging(true)
  }

  const onLabelPointerMove = (e) => {
    const ps = pointerRef.current
    if (!ps || e.pointerId !== ps.pointerId) return
    ps.moved = true
    const world = clientToWorld(e.clientX, e.clientY)
    updateLink(link.id, { labelT: projectOntoPath(points, world.x, world.y) })
  }

  const onLabelPointerUp = (e) => {
    const ps = pointerRef.current
    if (!ps || e.pointerId !== ps.pointerId) return
    labelRef.current.releasePointerCapture(e.pointerId)
    pointerRef.current = null
    setDragging(false)
    if (!ps.moved) select(link.id, 'link')
  }

  const handlePathClick = (e) => {
    e.stopPropagation()
    select(link.id, 'link')
  }

  const handleKeyDown = (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId === link.id)
      deleteLink(link.id)
  }

  const labelText = link.type ?? ''
  const boxW = labelText.length * CHAR_W + PAD_X * 2
  const boxH = FONT_SIZE + PAD_Y * 2

  return (
    <g onKeyDown={handleKeyDown} tabIndex={0} style={{ outline: 'none' }}>
      {/* Wide invisible hit area on path */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={10}
        style={{ cursor: 'pointer' }} onClick={handlePathClick} />

      {/* Visible path */}
      <path
        d={d}
        fill="none"
        stroke={isSelected ? '#0070f3' : '#555'}
        strokeWidth={isSelected ? 2 : 1.5}
        markerEnd="url(#arrow-default)"
      />

      {/* Draggable label badge */}
      <g
        ref={labelRef}
        transform={`translate(${pos.x},${pos.y}) rotate(${pos.angle})`}
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={onLabelPointerUp}
        onPointerCancel={onLabelPointerUp}
      >
        <rect
          x={-boxW / 2}
          y={-boxH / 2}
          width={boxW}
          height={boxH}
          rx={3}
          fill="white"
          stroke={isSelected ? '#0070f3' : '#aaa'}
          strokeWidth={1}
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={FONT_SIZE}
          fontFamily="sans-serif"
          fill="#333"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {labelText}
        </text>
      </g>
    </g>
  )
}
