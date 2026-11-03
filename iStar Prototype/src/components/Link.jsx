import { useRef, useState } from 'react'
import useStore from '../store/useStore.js'
import { upstreamSet, focusLayers } from '../utils/dependencies.js'
import { useT } from '../i18n.js'
import { useZoom } from '../contexts/ZoomContext.jsx'
import { getSideForPoint } from '../utils/ports.js'
import { GRID } from '../utils/grid.js'
import { pointsToPath, getPointAtT, projectOntoPath } from '../utils/routing.js'

const PAD_X = 10
const PAD_Y = 3
const FONT_SIZE = 10
const CHAR_W = 5.8

const ARROW_H  = 8   // triangle height
const ARROW_HW = 5   // triangle half-base width
const ICON_GAP = 4   // gap between triangle base and icon centre
const ICON_R        = ARROW_HW   // default icon radius
const LARGE_ICON_R  = 8          // larger icons for hurt/help/make/break
const ICON_STUB     = 3
const TRIM          = ARROW_H + ICON_GAP + ICON_R       * 2 - ICON_STUB
const TRIM_LARGE    = ARROW_H + ICON_GAP + LARGE_ICON_R * 2 - ICON_STUB
const TRIM_DOUBLE   = TRIM       + ICON_R       * 2 + 2
const TRIM_DOUBLE_L = TRIM_LARGE + LARGE_ICON_R * 2 + 2
const TRIM_NEEDED   = ARROW_H + ICON_GAP + ICON_R + ARROW_H / 2 - ICON_STUB  // inverse triangle

// Types that also have a source-end decoration (triangle + icon).
const SOURCE_DECORATED = new Set(['depends-on'])

const HIGHLIGHT_STYLES = {
  hurt:         { color: 'var(--hl-hurt)',       sw: 8 },
  break:        { color: 'var(--hl-hurt)',        sw: 8 },
  help:         { color: 'var(--hl-help)',        sw: 8 },
  make:         { color: 'var(--hl-help)',        sw: 8 },
  'needed-by':  { color: 'var(--hl-needed-by)',  sw: 6, dash: '8 4' },
  'depends-on': { color: 'var(--hl-depends-on)', sw: 6 },
  'or':         { color: 'var(--hl-or)',          sw: 6 },
  'xor':        { color: 'var(--hl-xor)',         sw: 6 },
  'and':        { color: 'var(--hl-and)',         sw: 6 },
  'part-of':    { color: 'var(--hl-part-of)',     sw: 6 },
}

// Direction + tip at the TARGET end (last segment).
function getEndArrow(points) {
  const n = points.length
  if (n < 2) return null
  const p1 = points[n - 2], p2 = points[n - 1]
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (len === 0) return null
  return { tip: p2, dx: (p2.x - p1.x) / len, dy: (p2.y - p1.y) / len }
}

// Direction + tip at the SOURCE end (first segment, pointing into source node).
function getStartArrow(points) {
  if (points.length < 2) return null
  const p1 = points[1], p2 = points[0]
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (len === 0) return null
  return { tip: p2, dx: (p2.x - p1.x) / len, dy: (p2.y - p1.y) / len }
}

function trimEnd(points, amount) {
  const n = points.length
  if (n < 2) return points
  const p1 = points[n - 2], p2 = points[n - 1]
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (len === 0) return trimEnd(points.slice(0, n - 1), amount)
  if (len < amount) return trimEnd(points.slice(0, n - 1), amount - len)
  const dx = (p2.x - p1.x) / len, dy = (p2.y - p1.y) / len
  return [...points.slice(0, n - 1), { x: p2.x - dx * amount, y: p2.y - dy * amount }]
}

function trimStart(points, amount) {
  if (points.length < 2) return points
  const p1 = points[0], p2 = points[1]
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (len === 0) return trimStart(points.slice(1), amount)
  if (len < amount) return trimStart(points.slice(1), amount - len)
  const dx = (p2.x - p1.x) / len, dy = (p2.y - p1.y) / len
  return [{ x: p1.x + dx * amount, y: p1.y + dy * amount }, ...points.slice(1)]
}

function arrowPolygon({ tip, dx, dy }) {
  const bx = tip.x - dx * ARROW_H, by = tip.y - dy * ARROW_H
  return [
    `${tip.x},${tip.y}`,
    `${bx - dy * ARROW_HW},${by + dx * ARROW_HW}`,
    `${bx + dy * ARROW_HW},${by - dx * ARROW_HW}`,
  ].join(' ')
}

function iconPos({ tip, dx, dy }, r = ICON_R) {
  const dist = ARROW_H + ICON_GAP + r
  return { x: tip.x - dx * dist, y: tip.y - dy * dist }
}

function MinusCircle({ x, y, color, r = ICON_R }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={color} />
      <rect x={x - r * 0.6} y={y - 1} width={r * 1.2} height={2} fill="white" />
    </>
  )
}

function PlusSign({ x, y, r = ICON_R, color = 'currentColor' }) {
  return (
    <>
      <rect x={x - r * 0.6} y={y - 1} width={r * 1.2} height={2} fill={color} />
      <rect x={x - 1} y={y - r * 0.6} width={2} height={r * 1.2} fill={color} />
    </>
  )
}

// Target-end icon (at the arrowhead end)
function TargetIcon({ type, x, y, dx, dy, color, sw, andBar }) {
  switch (type) {
    case 'depends-on': {
      const isw = 3
      return <rect x={x - ICON_R + isw / 2} y={y - ICON_R + isw / 2}
        width={(ICON_R - isw / 2) * 2} height={(ICON_R - isw / 2) * 2}
        fill="white" stroke={color} strokeWidth={isw} style={{ pointerEvents: 'none' }} />
    }
    case 'hurt':
      return <g style={{ pointerEvents: 'none' }}><MinusCircle x={x} y={y} color={color} r={LARGE_ICON_R} /></g>
    case 'help':
      return (
        <g style={{ pointerEvents: 'none' }}>
          <circle cx={x} cy={y} r={LARGE_ICON_R} fill="var(--node-fill)" stroke={color} strokeWidth={1.5} />
          <PlusSign x={x} y={y} r={LARGE_ICON_R} color={color} />
        </g>
      )
    case 'make': {
      const gap = LARGE_ICON_R * 2 + 2
      const x2 = x - dx * gap, y2 = y - dy * gap
      return (
        <g style={{ pointerEvents: 'none' }}>
          <circle cx={x2} cy={y2} r={LARGE_ICON_R} fill="var(--node-fill)" stroke={color} strokeWidth={1.5} />
          <PlusSign x={x2} y={y2} r={LARGE_ICON_R} color={color} />
          <circle cx={x}  cy={y}  r={LARGE_ICON_R} fill="var(--node-fill)" stroke={color} strokeWidth={1.5} />
          <PlusSign x={x}  y={y}  r={LARGE_ICON_R} color={color} />
        </g>
      )
    }
    case 'break': {
      const gap = LARGE_ICON_R * 2 + 2
      const x2 = x - dx * gap, y2 = y - dy * gap
      return (
        <g style={{ pointerEvents: 'none' }}>
          <MinusCircle x={x2} y={y2} color={color} r={LARGE_ICON_R} />
          <MinusCircle x={x}  y={y}  color={color} r={LARGE_ICON_R} />
        </g>
      )
    }
    case 'needed-by': {
      const tipX = x - dx * (ARROW_H / 2), tipY = y - dy * (ARROW_H / 2)
      const bx = x + dx * (ARROW_H / 2),   by   = y + dy * (ARROW_H / 2)
      const pts = [
        `${tipX},${tipY}`,
        `${bx - dy * ARROW_HW},${by + dx * ARROW_HW}`,
        `${bx + dy * ARROW_HW},${by - dx * ARROW_HW}`,
      ].join(' ')
      const clipId = `nb-${x|0}-${y|0}`
      return (
        <g style={{ pointerEvents: 'none' }}>
          <defs><clipPath id={clipId}><polygon points={pts} /></clipPath></defs>
          <polygon points={pts} fill="white" stroke={color} strokeWidth={sw * 2} clipPath={`url(#${clipId})`} />
        </g>
      )
    }
    case 'and': {
      const bar = andBar ?? {
        x1: x + dy * ICON_R, y1: y - dx * ICON_R,
        x2: x - dy * ICON_R, y2: y + dx * ICON_R,
      }
      return <line x1={bar.x1} y1={bar.y1} x2={bar.x2} y2={bar.y2}
        stroke={color} strokeWidth={1.5} strokeLinecap="round"
        style={{ pointerEvents: 'none' }} />
    }
    case 'xor':
      return <circle cx={x} cy={y} r={ICON_R} fill={color} style={{ pointerEvents: 'none' }} />
    case 'or': {
      const isw = Math.min(sw, 1.5)
      return <circle cx={x} cy={y} r={ICON_R - isw / 2} fill="white" stroke={color} strokeWidth={isw} style={{ pointerEvents: 'none' }} />
    }
    case 'part-of': {
      const r = ICON_R
      const ah = 3, aw = 1.5
      const toRad = d => d * Math.PI / 180
      // Rotate so arc midpoints face the link direction (source → target = dx,dy)
      const rotation = Math.atan2(-dy, -dx) * 180 / Math.PI - 265
      return (
        <g style={{ pointerEvents: 'none' }}>
          {[[20, 150], [200, 330]].map(([from, to], i) => {
            const fr = toRad(from + rotation), tr = toRad(to + rotation)
            const sx = x + r * Math.cos(fr), sy = y + r * Math.sin(fr)
            const ex = x + r * Math.cos(tr), ey = y + r * Math.sin(tr)
            const tdx = -Math.sin(tr), tdy = Math.cos(tr)  // clockwise tangent at arc end
            // Arc end is the arrowhead base; tip protrudes outward so arc never overlaps it
            const tipX = ex + tdx * ah, tipY = ey + tdy * ah
            const pts = [
              `${tipX},${tipY}`,
              `${ex - tdy * aw},${ey + tdx * aw}`,
              `${ex + tdy * aw},${ey - tdx * aw}`,
            ].join(' ')
            return (
              <g key={i}>
                <path d={`M ${sx},${sy} A ${r},${r} 0 0 1 ${ex},${ey}`}
                  fill="none" stroke={color} strokeWidth={sw} />
                <polygon points={pts} fill={color} />
              </g>
            )
          })}
        </g>
      )
    }
    default:
      return <circle cx={x} cy={y} r={ICON_R - sw / 2} fill="white" stroke={color} strokeWidth={sw} style={{ pointerEvents: 'none' }} />
  }
}

// Source-end icon (at the origin end)
function SourceIcon({ type, x, y, color, sw }) {
  switch (type) {
    case 'depends-on':
      return <rect x={x - ICON_R} y={y - ICON_R} width={ICON_R * 2} height={ICON_R * 2}
        fill={color} style={{ pointerEvents: 'none' }} />
    default:
      return null
  }
}

// Where a link crosses another, the one underneath breaks off to let the top one through; when the top
// one is highlighted it casts a shadow onto the one underneath instead.
const GAP = 4             // clear space either side of a top link that is not highlighted
const SHADOW_REACH = 14   // how far along the top link its shadow extends from the crossing
const SHADOW_LAYERS = [{ grow: 12, opacity: 0.05 }, { grow: 9, opacity: 0.07 }, { grow: 6, opacity: 0.1 }, { grow: 3, opacity: 0.14 }]
const BASE_SW = 1.5
const SELECTED_SW = 2

export default function Link({ link, points, andBar, allPaths = {}, crossings = [] }) {
  const labelRef   = useRef(null)
  const pathRef    = useRef(null)
  const headDrag   = useRef(null)
  const pointerRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const { selectedId, select, deleteLink, updateLink } = useStore()
  const { transformRef } = useZoom()
  const highlightTypes = useStore(s => s.highlightTypes)
  const isolateTypes   = useStore(s => s.isolateTypes)
  const focusNodeId    = useStore(s => s.focusNodeId)
  const hideTags       = useStore(s => s.hideTags)
  const tr             = useT()  // translate (t is the tag's position along the link)

  // What each crossing link looks like right now: 'h' hidden, 'n<width>' plain, 'a<width>' highlighted
  const otherLooks = useStore(s => {
    if (!crossings.length) return ''
    const focusSet = s.focusNodeId ? upstreamSet(s.links, s.focusNodeId, focusLayers(s)) : null
    return [...new Set(crossings.map(c => c.otherId))].map(id => {
      const o = s.links[id]
      if (!o || !s.isolateTypes.includes(o.type)) return `${id}:h`
      const active = (s.highlightTypes.length > 0 && s.highlightTypes.includes(o.type)) ||
        !!(focusSet && focusSet.has(o.sourceId) && focusSet.has(o.targetId))
      const sw = active ? HIGHLIGHT_STYLES[o.type]?.sw ?? BASE_SW : s.selectedId === id ? SELECTED_SW : BASE_SW
      return `${id}:${active ? 'a' : 'n'}${sw}`
    }).join('|')
  })

  const isHidden   = !isolateTypes.includes(link.type)
  const isFocused = useStore(s => {
    if (!s.focusNodeId) return false
    // A link is part of the view when both of its ends are
    const set = upstreamSet(s.links, s.focusNodeId, focusLayers(s))
    return set.has(link.sourceId) && set.has(link.targetId)
  })
  const isDimmed = !!focusNodeId && !isFocused

  if (!points || points.length < 2) return null

  const hasSource  = SOURCE_DECORATED.has(link.type)
  const endArrow   = getEndArrow(points)
  const startArrow = hasSource ? getStartArrow(points) : null

  const isLarge = ['hurt', 'help', 'make', 'break'].includes(link.type)
  const ir = isLarge ? LARGE_ICON_R : ICON_R
  const isDouble = link.type === 'break' || link.type === 'make'
  const endTrim = link.type === 'needed-by' ? TRIM_NEEDED
    : link.type === 'and'     ? ARROW_H + ICON_GAP + ICON_R
    : link.type === 'part-of' ? TRIM + ICON_STUB
    : isDouble ? (isLarge ? TRIM_DOUBLE_L : TRIM_DOUBLE)
    : isLarge ? TRIM_LARGE : TRIM
  let trimmed = endArrow ? trimEnd(points, endTrim) : points
  if (startArrow) trimmed = trimStart(trimmed, isLarge ? TRIM_LARGE : TRIM)

  const d          = pointsToPath(trimmed)
  const t          = link.labelT ?? 0.5
  const pos        = getPointAtT(points, t)
  const isSelected     = selectedId === link.id
  const isFilterActive = (highlightTypes.length > 0 && highlightTypes.includes(link.type)) || isFocused
  const hlStyle        = isFilterActive ? HIGHLIGHT_STYLES[link.type] : null
  const color          = hlStyle?.color ?? (isSelected ? '#0070f3' : 'var(--link-def)')
  const sw             = hlStyle?.sw    ?? (isSelected ? SELECTED_SW : BASE_SW)

  // Gaps in this link where a plain link passes over it; shadows from this link onto ones beneath it
  const looks = Object.fromEntries(otherLooks.split('|').filter(Boolean).map(e => {
    const [id, v] = e.split(':')
    return [id, { hidden: v === 'h', active: v[0] === 'a', sw: parseFloat(v.slice(1)) }]
  }))
  const gaps = crossings.filter(c => c.above && looks[c.otherId] && !looks[c.otherId].hidden && !looks[c.otherId].active)
  const shadows = isFilterActive ? crossings.filter(c => !c.above && looks[c.otherId] && !looks[c.otherId].hidden) : []
  const gapMaskId = `gap-${link.id}`, shadowMaskId = `shadow-${link.id}`
  const bounds = (() => {
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    const m = 60
    return { x: Math.min(...xs) - m, y: Math.min(...ys) - m, width: Math.max(...xs) - Math.min(...xs) + m * 2, height: Math.max(...ys) - Math.min(...ys) + m * 2 }
  })()
  const segment = (c, dir, reach) =>
    `M${c.x - dir.x * reach},${c.y - dir.y * reach} L${c.x + dir.x * reach},${c.y + dir.y * reach}`

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
    useStore.getState().beginBatch()  // sliding the tag is one undo step
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
    useStore.getState().endBatch()
    pointerRef.current = null
    setDragging(false)
    if (!ps.moved) select(link.id, 'link')
  }

  // Dragging an arrowhead moves where the link meets its element (link.targetAnchor / link.sourceAnchor);
  // moving either element drops that again (see clearSlotOverrides in the store), as does a double click
  const onHeadPointerDown = (e) => {
    if (e.button !== 0 || useStore.getState().mode !== 'select') return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    useStore.getState().beginBatch()
    headDrag.current = { pointerId: e.pointerId }
  }
  const onHeadPointerMove = (e, end) => {
    const hs = headDrag.current
    if (!hs || e.pointerId !== hs.pointerId) return
    const node = useStore.getState().nodes[end === 'source' ? link.sourceId : link.targetId]
    if (!node) return
    const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    const tf   = transformRef.current
    const wx = (e.clientX - rect.left - tf.x) / tf.k
    const wy = (e.clientY - rect.top  - tf.y) / tf.k
    const side = getSideForPoint(node, wx, wy)
    const horizontal = side === 'top' || side === 'bottom'
    const centre = horizontal ? node.x + node.width / 2 : node.y + node.height / 2
    const half = (horizontal ? node.width : node.height) / 2 - 14  // keep clear of rounded / pointed ends
    const offset = Math.round(Math.max(-half, Math.min(half, (horizontal ? wx : wy) - centre)) / (GRID / 2)) / 2
    const field = end === 'source' ? 'sourceAnchor' : 'targetAnchor'
    const cur = link[field]
    if (!cur || cur.side !== side || cur.offset !== offset) updateLink(link.id, { [field]: { side, offset } })
  }
  const onHeadPointerUp = (e) => {
    const hs = headDrag.current
    if (!hs || e.pointerId !== hs.pointerId) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    headDrag.current = null
    useStore.getState().endBatch()
  }
  // Invisible grab area just behind an arrowhead's tip
  const headGrab = (arrow, end) => {
    const field = end === 'source' ? 'sourceAnchor' : 'targetAnchor'
    return (
      <circle cx={arrow.tip.x - arrow.dx * 8} cy={arrow.tip.y - arrow.dy * 8} r={9}
        fill="transparent" style={{ cursor: 'grab' }}
        onPointerDown={onHeadPointerDown} onPointerMove={e => onHeadPointerMove(e, end)}
        onPointerUp={onHeadPointerUp} onPointerCancel={onHeadPointerUp}
        onDoubleClick={(e) => { e.stopPropagation(); if (link[field]) updateLink(link.id, { [field]: null }) }} />
    )
  }

  const handlePathClick = (e) => {
    e.stopPropagation()
    select(link.id, 'link')
  }

  const handleKeyDown = (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId === link.id)
      deleteLink(link.id)
  }

  const labelText = (link.type ? tr(`type.${link.type}`) : '').toUpperCase()
  const boxW = labelText.length * CHAR_W + PAD_X * 2
  const boxH = FONT_SIZE + PAD_Y * 2

  return (
    <g onKeyDown={handleKeyDown} tabIndex={0} style={{
      outline: 'none',
      opacity: isHidden ? 0 : isDimmed ? 0.12 : 1,
      pointerEvents: isHidden ? 'none' : undefined,
    }}>
      {/* Wide invisible hit area */}
      <path ref={pathRef} d={d} fill="none" stroke="transparent" strokeWidth={10}
        style={{ cursor: 'pointer' }} onClick={handlePathClick} />

      {gaps.length > 0 && (
        <mask id={gapMaskId} maskUnits="userSpaceOnUse" {...bounds}>
          <rect {...bounds} fill="white" />
          {gaps.map((c, i) => (
            <path key={i} d={segment(c, c.otherDir, sw / 2 + 1)} stroke="black" fill="none"
              strokeWidth={looks[c.otherId].sw + GAP * 2} />
          ))}
        </mask>
      )}

      {/* Shadow on the links beneath this one (clipped to them, only near the crossing) */}
      {shadows.length > 0 && (
        <>
          <mask id={shadowMaskId} maskUnits="userSpaceOnUse" {...bounds}>
            {shadows.map((c, i) => (
              <path key={i} d={pointsToPath(allPaths[c.otherId] ?? [])} stroke="white" fill="none" strokeWidth={looks[c.otherId].sw} />
            ))}
          </mask>
          <g mask={`url(#${shadowMaskId})`} style={{ pointerEvents: 'none' }}>
            {shadows.map((c, i) => SHADOW_LAYERS.map(({ grow, opacity }) => (
              <path key={`${i}-${grow}`} d={segment(c, c.selfDir, SHADOW_REACH)} stroke="black" strokeOpacity={opacity} fill="none"
                strokeWidth={sw + grow * 2} />
            )))}
          </g>
        </>
      )}

      {/* Visible path */}
      <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={hlStyle?.dash}
        mask={gaps.length > 0 ? `url(#${gapMaskId})` : undefined} />

      {/* Target end: triangle + icon */}
      {endArrow && (
        <>
          <polygon points={arrowPolygon(endArrow)} fill={color} style={{ pointerEvents: 'none' }} />
          <TargetIcon type={link.type} {...iconPos(endArrow, ir)} dx={endArrow.dx} dy={endArrow.dy} color={color} sw={sw} andBar={andBar} />
          {headGrab(endArrow, 'target')}
        </>
      )}

      {/* Source end: triangle + icon */}
      {startArrow && (
        <>
          <polygon points={arrowPolygon(startArrow)} fill={color} style={{ pointerEvents: 'none' }} />
          <SourceIcon type={link.type} {...iconPos(startArrow, ir)} color={color} sw={sw} />
          {headGrab(startArrow, 'source')}
        </>
      )}

      {/* Draggable label badge */}
      {!hideTags && <g
        ref={labelRef}
        transform={`translate(${pos.x},${pos.y}) rotate(${pos.angle})`}
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={onLabelPointerUp}
        onPointerCancel={onLabelPointerUp}
      >
        <rect
          x={-boxW / 2} y={-boxH / 2}
          width={boxW} height={boxH}
          rx={boxH / 2} fill="var(--node-fill)"
          stroke={color}
          strokeWidth={1}
        />
        <text
          textAnchor="middle" dominantBaseline="central"
          fontSize={FONT_SIZE} fontFamily="sans-serif" fill="var(--node-text)"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {labelText}
        </text>
      </g>}
    </g>
  )
}
