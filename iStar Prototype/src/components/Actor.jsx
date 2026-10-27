import { useRef, useMemo, useEffect } from 'react'
import useStore from '../store/useStore.js'
import { upstreamSet, focusLayers } from '../utils/dependencies.js'

const PAD = 20
const LINE_LEN = 15
const LABEL_PAD_X = 10
const LABEL_PAD_Y = 6
const LABEL_RADIUS = 6
const FONT_SIZE = 11
const FONT_SIZE_HL = 12.5  // name tag text size when the actor is highlighted
const STRIPE_GAP = 8       // spacing of the diagonal stripes in the highlight fill

let measureCtx = null
function measureText(text, font) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

function octilinearHull(points) {
  if (!points.length) return []

  let a = -Infinity, b = -Infinity, c = -Infinity, d = -Infinity
  let e = -Infinity, f = -Infißnity, g = -Infinity, h = -Infinity

  for (const { x, y } of points) {
    if (x > a) a = x
    if (x + y > b) b = x + y
    if (y > c) c = y
    if (-x + y > d) d = -x + y
    if (-x > e) e = -x
    if (-x - y > f) f = -x - y
    if (-y > g) g = -y
    if (x - y > h) h = x - y
  }

  const raw = [
    { x: a, y: b - a },
    { x: b - c, y: c },
    { x: c - d, y: c },
    { x: -e, y: d - e },
    { x: -e, y: e - f },
    { x: g - f, y: -g },
    { x: h - g, y: -g },
    { x: a, y: a - h },
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
    { x: n.x - PAD, y: n.y - PAD },
    { x: n.x + n.width + PAD, y: n.y - PAD },
    { x: n.x - PAD, y: n.y + n.height + PAD },
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

// Name tag geometry (world coords): the tag sits LINE_LEN out from the hull corner along lineDir,
// with its border meeting the connector line
function nameTag(name, highlighted, anchorCorner, lineDir) {
  const fontSize = highlighted ? FONT_SIZE_HL : FONT_SIZE
  const fontWeight = highlighted ? 'bold' : 'normal'
  const labelW = Math.max(36, measureText(name, `${fontWeight} ${fontSize}px sans-serif`) + 2 * LABEL_PAD_X)
  const labelH = fontSize + 2 * LABEL_PAD_Y
  const lineEndX = anchorCorner.x + LINE_LEN * lineDir.x
  const lineEndY = anchorCorner.y + LINE_LEN * lineDir.y
  // Distance from the label centre to its edge along lineDir, so the line meets the border
  const edgeDist = Math.min(
    Math.abs(lineDir.x) > 1e-6 ? (labelW / 2) / Math.abs(lineDir.x) : Infinity,
    Math.abs(lineDir.y) > 1e-6 ? (labelH / 2) / Math.abs(lineDir.y) : Infinity,
  )
  return {
    fontSize, fontWeight, labelW, labelH, lineEndX, lineEndY,
    labelCx: lineEndX + edgeDist * lineDir.x,
    labelCy: lineEndY + edgeDist * lineDir.y,
  }
}

export default function Actor({ actor }) {
  const nodes = useStore(s => s.nodes)
  // Hidden/highlighted for all actors (type row) or just this one (per-actor row) in the filter panel
  const isHidden = useStore(s => !s.isolateTypes.includes('actor') || s.hiddenActorIds.includes(actor.id))
  // Clicking the actor toggles the same per-actor highlight as the filter panel, so the two always agree
  // While a dependency view (Dependencies section) is on, actors holding any of its elements light up
  // and every other actor fades, like the elements and links outside the view
  const focusActive = useStore(s => !!s.focusNodeId)
  const inDependencyView = useStore(s => {
    if (!s.focusNodeId) return false
    const set = upstreamSet(s.links, s.focusNodeId, focusLayers(s))
    return Object.values(s.nodes).some(n => n.actorId === actor.id && set.has(n.id))
  })
  const isHighlighted = useStore(s =>
    s.highlightTypes.includes('actor') || s.highlightedActorIds.includes(actor.id)) || inDependencyView
  const { moveNodeGroup, toggleActorHighlight, openActorEditor, closeActorEditor, setEditingActorTag } = useStore()
  const isEditing = useStore(s => s.editingActorId === actor.id)

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

  const name = actor.name || ''
  const tag = anchorCorner ? nameTag(name, isHighlighted, anchorCorner, lineDir) : null

  // While this actor's edit popup is open, report where its name tag is so the popup can anchor to it
  const tagX = tag && tag.labelCx - tag.labelW / 2, tagY = tag && tag.labelCy - tag.labelH / 2
  const tagW = tag?.labelW, tagH = tag?.labelH
  useEffect(() => {
    if (isEditing) setEditingActorTag(tag && !isHidden ? { x: tagX, y: tagY, w: tagW, h: tagH } : null)
  }, [isEditing, isHidden, tagX, tagY, tagW, tagH]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!d || !tag || isHidden) return null

  const { fontSize, fontWeight, labelW, labelH, lineEndX, lineEndY, labelCx, labelCy } = tag

  const clientToWorld = (cx, cy) => {
    const pt = gRef.current.ownerSVGElement.createSVGPoint()
    pt.x = cx; pt.y = cy
    return pt.matrixTransform(gRef.current.parentNode.getScreenCTM().inverse())
  }

  // onPointerDown fires on the hit elements; capture is set on the <g>
  // so that subsequent move/up events (which go to the capturing element) are
  // handled by the <g> handlers below.
  // fromName: pressed on the name tag (a plain click there toggles the highlight)
  const onPointerDown = (e, fromName = false) => {
    if (e.button !== 0) return
    if (useStore.getState().mode !== 'select') return
    if (!memberIds.length) return
    e.stopPropagation()

    gRef.current.setPointerCapture(e.pointerId)
    useStore.getState().beginBatch()  // the whole drag is one undo step

    const world = clientToWorld(e.clientX, e.clientY)
    const leadNode = useStore.getState().nodes[memberIds[0]]

    dragRef.current = {
      pointerId: e.pointerId,
      startWorld: world,
      startLead: { x: leadNode.x, y: leadNode.y },
      hasMoved: false,
      fromName,
    }
  }

  // Move/up handlers live on the <g> so they receive the captured events.
  const onGroupPointerMove = (e) => {
    const ds = dragRef.current
    if (!ds || e.pointerId !== ds.pointerId) return

    const world = clientToWorld(e.clientX, e.clientY)
    const newLeadX = ds.startLead.x + (world.x - ds.startWorld.x)
    const newLeadY = ds.startLead.y + (world.y - ds.startWorld.y)
    if (Math.abs(newLeadX - ds.startLead.x) > 1 || Math.abs(newLeadY - ds.startLead.y) > 1) ds.hasMoved = true
    moveNodeGroup(memberIds[0], newLeadX, newLeadY, memberIds)
  }

  const onGroupPointerUp = (e) => {
    const ds = dragRef.current
    if (!ds || e.pointerId !== ds.pointerId) return
    gRef.current.releasePointerCapture(e.pointerId)
    dragRef.current = null
    useStore.getState().endBatch()
    // A plain click on the name tag toggles the highlight and opens / closes the edit popup with it;
    // dragging only moves the group
    if (ds.fromName && !ds.hasMoved) {
      toggleActorHighlight(actor.id)
      const s = useStore.getState()
      const lit = s.highlightTypes.includes('actor') || s.highlightedActorIds.includes(actor.id)
      if (lit) openActorEditor(actor.id)
      else if (s.editingActorId === actor.id) closeActorEditor()
    }
  }

  // Highlighted (incl. selected): solid line matching the name tag's stroke
  const hullStroke = isHighlighted ? 'var(--node-stroke)' : 'var(--text-3)'
  const hullStrokeW = isHighlighted ? 2 : 1
  const stripeId = `actor-stripes-${actor.id}`

  return (
    <g ref={gRef}
      opacity={focusActive && !inDependencyView ? 0.15 : 1}
      onPointerMove={onGroupPointerMove}
      onPointerUp={onGroupPointerUp}
      onPointerCancel={onGroupPointerUp}
    >
      {/* Highlighted: light fill with diagonal stripes */}
      {isHighlighted && <>
        <defs>
          <pattern id={stripeId} patternUnits="userSpaceOnUse" width={STRIPE_GAP} height={STRIPE_GAP}
            patternTransform="rotate(45)">
            <rect width={STRIPE_GAP} height={STRIPE_GAP} fill="var(--actor-hl-fill)" />
            <line x1={STRIPE_GAP / 2} y1={0} x2={STRIPE_GAP / 2} y2={STRIPE_GAP} stroke="var(--actor-hl-stripe)" strokeWidth={3} />
          </pattern>
        </defs>
        <path d={d} fill={`url(#${stripeId})`} stroke="none" style={{ pointerEvents: 'none' }} />
      </>}
      {/* Wide invisible hit area on the hull outline */}
      <path
        d={d} fill="none" stroke="transparent" strokeWidth={14}
        style={{ pointerEvents: 'stroke', cursor: 'move' }}
        onPointerDown={onPointerDown}
      />
      <path d={d} fill="none" stroke={hullStroke} strokeWidth={hullStrokeW}
        strokeDasharray={isHighlighted ? undefined : '6 3'} style={{ pointerEvents: 'none' }} />
      <line
        x1={anchorCorner.x} y1={anchorCorner.y}
        x2={lineEndX} y2={lineEndY}
        stroke="var(--node-stroke)" strokeWidth={isHighlighted ? 2 : 1} style={{ pointerEvents: 'none' }}
      />
      <rect
        x={labelCx - labelW / 2} y={labelCy - labelH / 2}
        width={labelW} height={labelH} rx={LABEL_RADIUS} ry={LABEL_RADIUS}
        fill="var(--node-fill)" stroke="var(--node-stroke)" strokeWidth={isHighlighted ? 2 : 1}
        style={{ cursor: 'pointer' }}
        onPointerDown={e => onPointerDown(e, true)}
      />
      <text
        x={labelCx} y={labelCy}
        textAnchor="middle" dominantBaseline="central"
        fontSize={fontSize} fontWeight={fontWeight} fontFamily="sans-serif" fill="var(--node-text)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {name}
      </text>
    </g>
  )
}
