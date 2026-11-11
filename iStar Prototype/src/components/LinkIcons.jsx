import { ARROW_H, ARROW_HW, ICON_GAP, ICON_R, LARGE_ICON_R, ICON_STUB, TRIM, TRIM_LARGE, TRIM_DOUBLE, TRIM_DOUBLE_L, TRIM_NEEDED, SOURCE_DECORATED, arrowPolygon, iconPos } from '../utils/linkShapes.js'

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
export function TargetIcon({ type, x, y, dx, dy, color, sw, andBar }) {
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
export function SourceIcon({ type, x, y, color, sw }) {
  switch (type) {
    case 'depends-on':
      return <rect x={x - ICON_R} y={y - ICON_R} width={ICON_R * 2} height={ICON_R * 2}
        fill={color} style={{ pointerEvents: 'none' }} />
    default:
      return null
  }
}

// A short straight link drawn like the real one: the same colour, thickness, dashes, arrowhead and end icon. It runs left to
// right when `outgoing`, right to left otherwise. Used where a link is described in words, such as the viewer popup.
export function LinkGlyph({ type, outgoing, color, sw, dash, height = 24 }) {
  const large = ['hurt', 'help', 'make', 'break'].includes(type)
  const double = type === 'break' || type === 'make'
  const trim = type === 'needed-by' ? TRIM_NEEDED
    : type === 'and' ? ARROW_H + ICON_GAP + ICON_R
    : type === 'part-of' ? TRIM + ICON_STUB
    : double ? (large ? TRIM_DOUBLE_L : TRIM_DOUBLE)
    : large ? TRIM_LARGE : TRIM
  // The tail (the plain stretch of line) is a third of what it was when the glyph was a fixed 96 wide
  const width = 4 + trim + (92 - trim) / 3
  const dir = outgoing ? 1 : -1
  const y = height / 2
  const from = outgoing ? 2 : width - 2
  const to = outgoing ? width - 2 : 2
  const end = { tip: { x: to, y }, dx: dir, dy: 0 }
  const start = { tip: { x: from, y }, dx: -dir, dy: 0 }
  const hasSource = SOURCE_DECORATED.has(type)
  const lineFrom = hasSource ? from + dir * (large ? TRIM_LARGE : TRIM) : from
  const ir = large ? LARGE_ICON_R : ICON_R
  return (
    <svg width={width} height={height} aria-hidden style={{ flexShrink: 0, overflow: 'visible' }}>
      <line x1={lineFrom} y1={y} x2={to - dir * trim} y2={y} stroke={color} strokeWidth={sw} strokeDasharray={dash} />
      <polygon points={arrowPolygon(end)} fill={color} />
      <TargetIcon type={type} {...iconPos(end, ir)} dx={dir} dy={0} color={color} sw={sw} />
      {hasSource && (
        <>
          <polygon points={arrowPolygon(start)} fill={color} />
          <SourceIcon type={type} {...iconPos(start, ir)} color={color} sw={sw} />
        </>
      )}
    </svg>
  )
}
