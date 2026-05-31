import { useRef, useMemo } from 'react'
import useStore from '../store/useStore.js'

const PAD = 20
const LINE_LEN = 15

function octilinearHull(points) {
  if (!points.length) return []

  let a = -Infinity, b = -Infinity, c = -Infinity, d = -Infinity
  let e = -Infinity, f = -Infinity, g = -Infinity, h = -Infinity

  for (const { x, y } of points) {
    if (x       > a) a = x
    if (x + y   > b) b = x + y
    if (y       > c) c = y
    if (-x + y  > d) d = -x + y
    if (-x      > e) e = -x
    if (-x - y  > f) f = -x - y
    if (-y      > g) g = -y
    if (x - y   > h) h = x - y
  }

  const raw = [
    { x: a,     y: b - a },
    { x: b - c, y: c     },
    { x: c - d, y: c     },
    { x: -e,    y: d - e },
    { x: -e,    y: e - f },
    { x: g - f, y: -g    },
    { x: h - g, y: -g    },
    { x: a,     y: a - h },
  ]

  const eps = 0.01
  const verts = []
  for (const v of raw) {
    const prev = verts[verts.length - 1]
    if (!prev || Math.abs(v.x - prev.x) > eps || Math.abs(v.y - prev.y) > eps)
      verts.push(v)
  }
  const last = verts[verts.length - 1], first = verts[0]
  if (verts.length > 1 &&
      Math.abs(last.x - first.x) < eps &&
      Math.abs(last.y - first.y) < eps)
    verts.pop()

  return verts
}

function paddedCorners(members) {
  return members.flatMap(n => [
    { x: n.x - PAD,           y: n.y - PAD            },
    { x: n.x + n.width + PAD, y: n.y - PAD            },
    { x: n.x - PAD,           y: n.y + n.height + PAD },
    { x: n.x + n.width + PAD, y: n.y + n.height + PAD },
  ])
}

function buildHullPath(verts, r = 15) {
  const n = verts.length
  const A = [], B = []
  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n]
    const curr = verts[i]
    const next = verts[(i + 1) % n]
    const d1x = curr.x - prev.x, d1y = curr.y - prev.y
    const d2x = next.x - curr.x, d2y = next.y - curr.y
    const len1 = Math.hypot(d1x, d1y), len2 = Math.hypot(d2x, d2y)
    const rr = Math.min(r, len1 / 2, len2 / 2)
    A[i] = { x: curr.x - (d1x / len1) * rr, y: curr.y - (d1y / len1) * rr }
    B[i] = { x: curr.x + (d2x / len2) * rr, y: curr.y + (d2y / len2) * rr }
  }

  let d = `M${A[0].x},${A[0].y}`
  for (let i = 0; i < n; i++) {
    d += ` Q${verts[i].x},${verts[i].y} ${B[i].x},${B[i].y}`
    const next = (i + 1) % n
    if (next !== 0) d += ` L${A[next].x},${A[next].y}`
  }

  const cornerMid = verts.map((v, i) => ({
    x: 0.25 * A[i].x + 0.5 * v.x + 0.25 * B[i].x,
    y: 0.25 * A[i].y + 0.5 * v.y + 0.25 * B[i].y,
  }))

  return { d: d + ' Z', cornerMid }
}

export default function Actor({ actor }) {
  const nodes = useStore(s => s.nodes)
  const isSelected = useStore(s =>
    Object.values(s.nodes).some(n => n.actorId === actor.id && s.selectedIds.includes(n.id))
  )
  const { selectActorNodes, moveNodeGroup } = useStore()

  const gRef = useRef(null)
  const dragRef = useRef(null)

  const { d, anchorCorner, lineDir, memberIds } = useMemo(() => {
    const members = Object.values(nodes).filter(n => n.actorId === actor.id)
    if (!members.length) return {}

    // Actor centroid
    const actorCx = members.reduce((s, n) => s + n.x + n.width / 2, 0) / members.length
    const actorCy = members.reduce((s, n) => s + n.y + n.height / 2, 0) / members.length

    // Diagram centre of mass (all nodes)
    const allNodes = Object.values(nodes)
    const diagCx = allNodes.reduce((s, n) => s + n.x + n.width / 2, 0) / allNodes.length
    const diagCy = allNodes.reduce((s, n) => s + n.y + n.height / 2, 0) / allNodes.length

    // Outward direction: from diagram centre toward this actor's centroid
    let odx = actorCx - diagCx
    let ody = actorCy - diagCy
    const len = Math.hypot(odx, ody)
    if (len < 1) { odx = -1 / Math.SQRT2; ody = -1 / Math.SQRT2 }
    else { odx /= len; ody /= len }

    const verts = octilinearHull(paddedCorners(members))
    if (verts.length < 3) return {}

    const { d, cornerMid } = buildHullPath(verts, 15)

    // Pick the hull vertex most in the outward direction
    const outerIdx = verts.reduce((best, _, i) =>
      verts[i].x * odx + verts[i].y * ody > verts[best].x * odx + verts[best].y * ody ? i : best, 0)

    return {
      d,
      anchorCorner: cornerMid[outerIdx],
      lineDir: { x: odx, y: ody },
      memberIds: members.map(m => m.id),
    }
  }, [nodes, actor.id])

  if (!d || !anchorCorner) return null

  const name = actor.name || ''
  const FONT_SIZE = 11
  const circleR = Math.max(18, name.length * FONT_SIZE * 0.32 + 8)

  const lineEndX = anchorCorner.x + LINE_LEN * lineDir.x
  const lineEndY = anchorCorner.y + LINE_LEN * lineDir.y
  const circleCx = anchorCorner.x + (LINE_LEN + circleR) * lineDir.x
  const circleCy = anchorCorner.y + (LINE_LEN + circleR) * lineDir.y

  const clientToWorld = (cx, cy) => {
    const pt = gRef.current.ownerSVGElement.createSVGPoint()
    pt.x = cx; pt.y = cy
    return pt.matrixTransform(gRef.current.parentNode.getScreenCTM().inverse())
  }

  // onPointerDown fires on the hit elements; capture is set on the <g>
  // so that subsequent move/up events (which go to the capturing element) are
  // handled by the <g> handlers below.
  const onPointerDown = (e) => {
    if (e.button !== 0) return
    if (useStore.getState().mode !== 'select') return
    if (!memberIds.length) return
    e.stopPropagation()

    selectActorNodes(actor.id)
    gRef.current.setPointerCapture(e.pointerId)

    const world = clientToWorld(e.clientX, e.clientY)
    const leadNode = useStore.getState().nodes[memberIds[0]]

    dragRef.current = {
      pointerId: e.pointerId,
      startWorld: world,
      startLead: { x: leadNode.x, y: leadNode.y },
    }
  }

  // Move/up handlers live on the <g> so they receive the captured events.
  const onGroupPointerMove = (e) => {
    const ds = dragRef.current
    if (!ds || e.pointerId !== ds.pointerId) return

    const world = clientToWorld(e.clientX, e.clientY)
    const newLeadX = ds.startLead.x + (world.x - ds.startWorld.x)
    const newLeadY = ds.startLead.y + (world.y - ds.startWorld.y)
    moveNodeGroup(memberIds[0], newLeadX, newLeadY, memberIds)
  }

  const onGroupPointerUp = (e) => {
    const ds = dragRef.current
    if (!ds || e.pointerId !== ds.pointerId) return
    gRef.current.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }

  const hullStroke = isSelected ? '#0070f3' : 'var(--text-3)'

  return (
    <g ref={gRef}
      onPointerMove={onGroupPointerMove}
      onPointerUp={onGroupPointerUp}
      onPointerCancel={onGroupPointerUp}
    >
      {/* Wide invisible hit area on the hull outline */}
      <path
        d={d} fill="none" stroke="transparent" strokeWidth={14}
        style={{ pointerEvents: 'stroke', cursor: 'move' }}
        onPointerDown={onPointerDown}
      />
      <path d={d} fill="none" stroke={hullStroke} strokeWidth={isSelected ? 1.5 : 1}
        strokeDasharray="6 3" style={{ pointerEvents: 'none' }} />
      <line
        x1={anchorCorner.x} y1={anchorCorner.y}
        x2={lineEndX}       y2={lineEndY}
        stroke="var(--node-stroke)" strokeWidth={1} style={{ pointerEvents: 'none' }}
      />
      <circle cx={circleCx} cy={circleCy} r={circleR}
        fill="var(--node-fill)" stroke="var(--node-stroke)" strokeWidth={1}
        style={{ cursor: 'move' }}
        onPointerDown={onPointerDown}
      />
      <text
        x={circleCx} y={circleCy}
        textAnchor="middle" dominantBaseline="central"
        fontSize={FONT_SIZE} fontFamily="sans-serif" fill="var(--node-text)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {name}
      </text>
    </g>
  )
}
