import { useRef, useMemo, useEffect } from 'react'
import useStore from '../store/useStore.js'
import {
  actorLayout, actorNames, octilinearHull, inActor, topCenterOf, tagTextSize, LOGO_GAP,
  extentsOf, hullsSeparated, logoSize, tagHeight,
  LINE_LEN, tagFontSize,
} from '../utils/actorTree.js'
import { upstreamSet, focusLayers } from '../utils/dependencies.js'

const LABEL_RADIUS = 6
const TAG_SLIDE_STEP = 24  // a nested tag slides along its top edge in steps of this much
const TAG_CLEARANCE = 8    // least space between a name tag and its actor's area
const STRIPE_GAP = 8       // spacing of the diagonal stripes in the highlight fill

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
function nameTag(name, logo, highlighted, nested, anchorCorner, lineDir, hullExt) {
  const fontSize = tagFontSize(nested, highlighted)
  const fontWeight = highlighted ? 'bold' : 'normal'
  const { textW, contentW, labelW } = tagTextSize(name, fontSize, highlighted, logo)
  const labelH = tagHeight(fontSize, logo)
  // Distance from the label centre to its edge along lineDir, so the line meets the border
  const edgeDist = Math.min(
    Math.abs(lineDir.x) > 1e-6 ? (labelW / 2) / Math.abs(lineDir.x) : Infinity,
    Math.abs(lineDir.y) > 1e-6 ? (labelH / 2) / Math.abs(lineDir.y) : Infinity,
  )
  // A wide tag (long name, logo) can reach back over the actor's area near a slanted corner, so the
  // connector is lengthened until the tag keeps TAG_CLEARANCE away from the area
  let lineLen = LINE_LEN, lineEndX, lineEndY, labelCx, labelCy
  for (; ; lineLen += 2) {
    lineEndX = anchorCorner.x + lineLen * lineDir.x
    lineEndY = anchorCorner.y + lineLen * lineDir.y
    labelCx = lineEndX + edgeDist * lineDir.x
    labelCy = lineEndY + edgeDist * lineDir.y
    const box = extentsOf([
      { x: labelCx - labelW / 2, y: labelCy - labelH / 2 }, { x: labelCx + labelW / 2, y: labelCy - labelH / 2 },
      { x: labelCx - labelW / 2, y: labelCy + labelH / 2 }, { x: labelCx + labelW / 2, y: labelCy + labelH / 2 },
    ])
    if (!hullExt || lineLen > 600 || hullsSeparated(box, hullExt, TAG_CLEARANCE)) break
  }
  return { fontSize, fontWeight, labelW, labelH, lineEndX, lineEndY, textW, contentW, labelCx, labelCy }
}

// Background of an actor's zone. With nothing nested it is the plain --actor-bg. In a nesting the deepest
// actor is --actor-bg-light and each level out is mixed further towards --actor-bg-deep: a tree of 1
// level steps by 75%; deeper trees spread up to a full 100% over their levels.
const HL_TONE = 12      // % the highlighted background is pulled towards the blue-grey --actor-hl-tone
const STRIPE_TINT = 20  // % the highlight stripes are pulled towards --actor-hl-stripe-mix (darker, in the light theme)
const SHADE_STEP = 75
function backgroundShade({ depth, levels }) {
  if (!levels) return 'var(--actor-bg)'
  const pct = ((levels - depth) / levels) * Math.min(100, SHADE_STEP * levels)
  return `color-mix(in srgb, var(--actor-bg-deep) ${pct}%, var(--actor-bg-light))`
}

// Does a tag (box + connector line) touch a link or an element? Boxes are checked with a small margin.
const TAG_AVOID_MARGIN = 4
function segmentHitsRect(a, b, r) {
  let t0 = 0, t1 = 1
  const dx = b.x - a.x, dy = b.y - a.y
  for (const [p, q] of [[-dx, a.x - r.x1], [dx, r.x2 - a.x], [-dy, a.y - r.y1], [dy, r.y2 - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue }
    const k = q / p
    if (p < 0) { if (k > t1) return false; if (k > t0) t0 = k }
    else { if (k < t0) return false; if (k < t1) t1 = k }
  }
  return true
}
function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)
}
function tagHitsSomething(tag, anchor, linkPaths, nodes) {
  const m = TAG_AVOID_MARGIN
  const box = { x1: tag.labelCx - tag.labelW / 2 - m, x2: tag.labelCx + tag.labelW / 2 + m,
    y1: tag.labelCy - tag.labelH / 2 - m, y2: tag.labelCy + tag.labelH / 2 + m }
  const lineEnd = { x: tag.lineEndX, y: tag.lineEndY }
  for (const path of Object.values(linkPaths)) {
    for (let i = 1; i < path.length; i++) {
      if (segmentHitsRect(path[i - 1], path[i], box)) return true
      if (segmentsCross(anchor, lineEnd, path[i - 1], path[i])) return true
    }
  }
  return Object.values(nodes).some(n =>
    n.x < box.x2 && n.x + n.width > box.x1 && n.y < box.y2 && n.y + n.height > box.y1)
}

export default function Actor({ actor, linkPaths = {} }) {
  const nodes = useStore(s => s.nodes)
  const actors = useStore(s => s.actors)
  const names = useMemo(() => actorNames(actors), [actors])
  // Hidden/highlighted for all actors (type row) or just this one (per-actor row) in the filter panel
  const isHidden = useStore(s => !s.isolateTypes.includes('actor') || s.hiddenActorIds.includes(actor.id))
  // Clicking the actor toggles the same per-actor highlight as the filter panel, so the two always agree
  // While a dependency view (Dependencies section) is on, actors holding any of its elements light up
  // and every other actor fades, like the elements and links outside the view
  const focusActive = useStore(s => !!s.focusNodeId)
  const inDependencyView = useStore(s => {
    if (!s.focusNodeId) return false
    const set = upstreamSet(s.links, s.focusNodeId, focusLayers(s))
    return Object.values(s.nodes).some(n => inActor(n, actor.id) && set.has(n.id))
  })
  const isHighlighted = useStore(s =>
    s.highlightTypes.includes('actor') || s.highlightedActorIds.includes(actor.id)) || inDependencyView
  const { moveNodeGroup, toggleActorHighlight, openActorEditor, closeActorEditor, setEditingActorTag } = useStore()
  const isEditing = useStore(s => s.editingActorId === actor.id)

  const gRef = useRef(null)
  const dragRef = useRef(null)

  const { d, candidates, memberIds, nested, hullExt, shade } = useMemo(() => {
    const layout = actorLayout(nodes, names)
    const members = layout.members[actor.id] ?? []
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

    const verts = octilinearHull(layout.points[actor.id])
    if (verts.length < 3) return {}

    const { d, cornerMid } = buildHullPath(verts, 15)

    // Where the tag can hang from, best first; it takes the first spot where it touches no link or
    // element. A primary actor's tag hangs off a corner of its outline, outermost corner first.
    // A nested actor's tag hangs off its top edge (the room its parent leaves there), middle first.
    const nested = !!layout.parentOf[actor.id]
    let candidates
    if (nested) {
      const top = topCenterOf(verts)
      const topXs = verts.filter(v => v.y - top.y < 0.5).map(v => v.x)
      const lo = Math.min(...topXs), hi = Math.max(...topXs)
      const offsets = [0]
      for (let o = TAG_SLIDE_STEP; top.x - o >= lo || top.x + o <= hi; o += TAG_SLIDE_STEP) offsets.push(-o, o)
      candidates = offsets
        .filter(o => top.x + o >= lo - 0.5 && top.x + o <= hi + 0.5)
        .map(o => ({ anchor: { x: top.x + o, y: top.y }, dir: { x: 0, y: -1 } }))
    } else {
      const score = i => verts[i].x * odx + verts[i].y * ody
      const order = verts.map((_, i) => i).sort((a, b) => score(b) - score(a))
      candidates = order.map((i, rank) => {
        if (rank === 0) return { anchor: cornerMid[i], dir: { x: odx, y: ody } }
        const vx = cornerMid[i].x - actorCx, vy = cornerMid[i].y - actorCy, vl = Math.hypot(vx, vy) || 1
        return { anchor: cornerMid[i], dir: { x: vx / vl, y: vy / vl } }
      })
    }

    return {
      d,
      nested, candidates,
      hullExt: extentsOf(layout.points[actor.id]),
      shade: layout.shade[actor.id],
      memberIds: members.map(m => m.id),
    }
  }, [nodes, names, actor.id])

  const name = actor.name || ''
  const logoAspect = actor.logo ? actor.logoAspect ?? 1 : 0
  const tag = useMemo(() => {
    if (!candidates) return null
    let first = null
    for (const { anchor, dir } of candidates) {
      const tag = { ...nameTag(name, logoAspect, isHighlighted, nested, anchor, dir, hullExt), anchor }
      if (!tagHitsSomething(tag, anchor, linkPaths, nodes)) return tag
      first ??= tag
    }
    return first
  }, [candidates, name, logoAspect, isHighlighted, nested, hullExt, linkPaths, nodes])

  // While this actor's edit popup is open, report where its name tag is so the popup can anchor to it
  const tagX = tag && tag.labelCx - tag.labelW / 2, tagY = tag && tag.labelCy - tag.labelH / 2
  const tagW = tag?.labelW, tagH = tag?.labelH
  useEffect(() => {
    if (isEditing) setEditingActorTag(tag && !isHidden ? { x: tagX, y: tagY, w: tagW, h: tagH } : null)
  }, [isEditing, isHidden, tagX, tagY, tagW, tagH]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!d || !tag || isHidden) return null

  const { fontSize, fontWeight, labelW, labelH, lineEndX, lineEndY, labelCx, labelCy, textW, contentW } = tag
  const logo = actor.logo ? logoSize(fontSize, logoAspect) : null

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
  const bg = backgroundShade(shade)
  // Highlighted: the actor's own shade, pulled towards blue-grey (the stripes are drawn over this)
  const hlBg = `color-mix(in srgb, var(--actor-hl-tone) ${HL_TONE}%, ${bg})`
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
      {/* Light grey background. With nesting it gets darker towards the primary actor: the deepest
          nested actor is the lightest, each level out is darker (see backgroundShade) */}
      <path d={d} stroke="none" style={{ fill: bg, pointerEvents: 'none' }} />
      {/* Highlighted: light fill with diagonal stripes */}
      {isHighlighted && <>
        <defs>
          <pattern id={stripeId} patternUnits="userSpaceOnUse" width={STRIPE_GAP} height={STRIPE_GAP}
            patternTransform="rotate(45)">
            <rect width={STRIPE_GAP} height={STRIPE_GAP} style={{ fill: hlBg }} />
            <line x1={STRIPE_GAP / 2} y1={0} x2={STRIPE_GAP / 2} y2={STRIPE_GAP} strokeWidth={3}
              style={{ stroke: `color-mix(in srgb, var(--actor-hl-stripe-mix) ${STRIPE_TINT}%, ${hlBg})` }} />
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
        x1={tag.anchor.x} y1={tag.anchor.y}
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
        x={actor.logo ? labelCx - contentW / 2 : labelCx} y={labelCy}
        textAnchor={actor.logo ? 'start' : 'middle'} dominantBaseline="central"
        fontSize={fontSize} fontWeight={fontWeight} fontFamily="sans-serif" fill="var(--node-text)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {name}
      </text>
      {/* Logo to the right of the name; its shorter side is as long as the text is tall */}
      {actor.logo && (
        <image
          href={actor.logo} width={logo.w} height={logo.h}
          x={labelCx - contentW / 2 + textW + LOGO_GAP} y={labelCy - logo.h / 2}
          preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  )
}
