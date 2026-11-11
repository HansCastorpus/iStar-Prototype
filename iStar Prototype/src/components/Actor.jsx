import { useRef, useMemo, useEffect } from 'react'
import useStore from '../store/useStore.js'
import {
  actorLayout, actorNames, octilinearHull, inActor, chainOf, headerSize, logoSize, barSpan,
  HEADER_H, HEADER_FONT, HEADER_LOGO, HEADER_GAP, actorTintVar,
} from '../utils/actorTree.js'
import { focusView } from '../utils/dependencies.js'

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

  return d + ' Z'
}

// Background of an actor's zone. With nothing nested it is the plain --actor-bg. In a nesting the deepest
// actor is --actor-bg-light and each level out is mixed further towards --actor-bg-deep: a tree of 1
// level steps by 75%; deeper trees spread up to a full 100% over their levels.
const SHADE_STEP = 75
// A highlighted actor also leans towards its own colour (tint), so neighbouring actors are told apart at a glance.
const TINT_PCT = 'var(--actor-tint-pct, 30%)'   // a colour set can set it to 0% (no tint in the body)
function backgroundShade({ depth, levels }, tint) {
  let base = 'var(--actor-bg)'
  if (levels) {
    const pct = ((levels - depth) / levels) * Math.min(100, SHADE_STEP * levels)
    base = `color-mix(in srgb, var(--actor-bg-deep) ${pct}%, var(--actor-bg-light))`
  }
  return tint ? `color-mix(in srgb, ${tint} ${TINT_PCT}, ${base})` : base
}

// extras / offset come from barLayout (actorBars.js): how much wider the name bar is made and how far the name
// slides along it so that no link crosses the name
export default function Actor({ actor, extras, offset = 0 }) {
  const nodes = useStore(s => s.nodes)
  const actors = useStore(s => s.actors)
  const names = useMemo(() => actorNames(actors), [actors])
  // Hidden/highlighted for all actors (type row) or just this one (per-actor row) in the filter panel
  const isHidden = useStore(s => !s.isolateTypes.includes('actor') || s.hiddenActorIds.includes(actor.id))
  // Clicking the actor toggles the same per-actor highlight as the filter panel, so the two always agree
  // While a dependency view (Dependencies section) is on, actors holding any of its elements light up
  // and every other actor fades, like the elements and links outside the view
  const focusActive = useStore(s => !!focusView(s))
  const inDependencyView = useStore(s => {
    const view = focusView(s)
    return !!view && Object.values(s.nodes).some(n => inActor(n, actor.id) && view.nodes.has(n.id))
  })
  const isHighlighted = useStore(s =>
    s.highlightTypes.includes('actor') || s.highlightedActorIds.includes(actor.id)) || inDependencyView
  const { moveNodeGroup, toggleActorHighlight, openActorEditor, closeActorEditor, setEditingActorTag } = useStore()
  const isEditing = useStore(s => s.editingActorId === actor.id)

  const gRef = useRef(null)
  const dragRef = useRef(null)

  // The outline, and the name bar at its top: its box (x1..x2 across the whole outline, clipped to it when drawn) and
  // the middle of the bar at the height of the logo and name, where they are centred
  const { d, memberIds, shade, bar } = useMemo(() => {
    const layout = actorLayout(nodes, names, extras)
    const members = layout.members[actor.id] ?? []
    if (!members.length) return {}
    const verts = octilinearHull(layout.points[actor.id])
    if (verts.length < 3) return {}
    const topY = Math.min(...verts.map(v => v.y))
    const xs = verts.map(v => v.x)
    const { lo, hi } = barSpan(verts, topY)
    return {
      d: buildHullPath(verts, 15),
      shade: layout.shade[actor.id],
      memberIds: members.map(m => m.id),
      bar: { x1: Math.min(...xs), x2: Math.max(...xs), y1: topY, y2: topY + HEADER_H, cx: (lo + hi) / 2, lo, hi },
    }
  }, [nodes, names, extras, actor.id])

  // While this actor's edit popup is open, report where its name bar is so the popup can anchor to it
  const tagX = bar?.lo, tagY = bar?.y1, tagW = bar && bar.hi - bar.lo
  useEffect(() => {
    if (isEditing) setEditingActorTag(bar && !isHidden ? { x: tagX, y: tagY, w: tagW, h: HEADER_H } : null)
  }, [isEditing, isHidden, tagX, tagY, tagW]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!d || isHidden) return null

  const name = actor.name || ''
  const logoAspect = actor.logo ? actor.logoAspect ?? 1 : 0
  const { contentW } = headerSize(name, logoAspect)
  const logo = actor.logo ? logoSize(HEADER_LOGO, logoAspect) : null
  const startX = bar.cx + offset - contentW / 2
  const midY = bar.y1 + HEADER_H / 2
  const clipId = `actor-clip-${actor.id}`

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
    const st = useStore.getState()
    const leadNode = st.nodes[memberIds[0]]

    // A highlighted actor drags together with every other highlighted (visible) actor
    let groupIds = memberIds
    const allLit = st.highlightTypes.includes('actor')
    if (allLit || st.highlightedActorIds.includes(actor.id)) {
      const litIds = new Set(allLit ? Object.keys(st.actors) : st.highlightedActorIds)
      const visible = id => st.isolateTypes.includes('actor') && !st.hiddenActorIds.includes(id)
      const group = new Set(memberIds)
      for (const n of Object.values(st.nodes)) {
        for (const id of litIds) if (visible(id) && inActor(n, id)) { group.add(n.id); break }
      }
      // Elements outside every actor that link to elements of two or more different highlighted actors
      // (a dependum sitting between them) come along
      if (group.size > memberIds.length) {
        const owner = {}  // element id -> its primary actor, for the elements being moved
        for (const id of group) owner[id] = st.nodes[id].actorId
        for (const n of Object.values(st.nodes)) {
          if (group.has(n.id) || chainOf(n).length) continue
          const owners = new Set()
          for (const l of Object.values(st.links)) {
            const other = l.sourceId === n.id ? l.targetId : l.targetId === n.id ? l.sourceId : null
            if (other && owner[other]) owners.add(owner[other])
          }
          if (owners.size >= 2) group.add(n.id)
        }
      }
      groupIds = [...group]
    }

    dragRef.current = {
      groupIds,
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
    moveNodeGroup(memberIds[0], newLeadX, newLeadY, ds.groupIds)
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
      if (useStore.getState().viewer) { useStore.getState().pickActor(actor.id); return }
      toggleActorHighlight(actor.id)
      const s = useStore.getState()
      const lit = s.highlightTypes.includes('actor') || s.highlightedActorIds.includes(actor.id)
      if (lit) openActorEditor(actor.id)
      else if (s.editingActorId === actor.id) closeActorEditor()
    }
  }

  // Highlighted (incl. selected): solid, thicker outline and a tinted body; the name bar keeps its plain fill
  const tint = actorTintVar(actors, actor.id)
  const bg = backgroundShade(shade, isHighlighted ? tint : null)
  const hullStroke = isHighlighted ? `color-mix(in srgb, ${tint} var(--actor-stroke-tint, 0%), var(--node-stroke))` : 'var(--text-3)'  // a colour set can make the outline the actor's own colour
  const hullStrokeW = isHighlighted ? 'var(--actor-hl-sw, 2)' : 1  // a colour set can thicken the highlight (set through style: CSS variables don't work in the attribute)
  const barFill = isHighlighted ? `color-mix(in srgb, ${tint} var(--actor-bar-tint, 0%), var(--node-fill))` : 'var(--node-fill)'

  return (
    <g ref={gRef}
      opacity={focusActive && !inDependencyView ? 0.15 : 1}
      onPointerMove={onGroupPointerMove}
      onPointerUp={onGroupPointerUp}
      onPointerCancel={onGroupPointerUp}
    >
      <defs><clipPath id={clipId}><path d={d} /></clipPath></defs>
      {/* Light grey background. With nesting it gets darker towards the primary actor: the deepest
          nested actor is the lightest, each level out is darker (see backgroundShade) */}
      <path d={d} stroke="none" style={{ fill: bg, pointerEvents: 'none' }} />
      {/* Wide invisible hit area on the hull outline */}
      <path
        d={d} fill="none" stroke="transparent" strokeWidth={14}
        style={{ pointerEvents: 'stroke', cursor: 'move' }}
        onPointerDown={onPointerDown}
      />
      {/* The name bar: the top of the area itself, cut to the outline's shape; pressing it toggles the highlight */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          x={bar.x1} y={bar.y1} width={bar.x2 - bar.x1} height={HEADER_H}
          fill={barFill} style={{ cursor: 'pointer' }}
          onPointerDown={e => onPointerDown(e, true)}
        />
        <line x1={bar.x1} x2={bar.x2} y1={bar.y2} y2={bar.y2}
          stroke={hullStroke} style={{ strokeWidth: hullStrokeW, pointerEvents: 'none' }} />
      </g>
      <path d={d} fill="none" stroke={hullStroke}
        style={{ strokeWidth: hullStrokeW, strokeDasharray: isHighlighted ? 'none' : 'var(--actor-dash, 6 3)', pointerEvents: 'none' }} />
      {/* Logo on the left of the name; its shorter side is HEADER_LOGO */}
      {logo && (
        <image
          href={actor.logo} width={logo.w} height={logo.h}
          x={startX} y={midY - logo.h / 2}
          preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }}
        />
      )}
      <text
        x={startX + (logo ? logo.w + HEADER_GAP : 0)} y={midY}
        textAnchor="start" dominantBaseline="central"
        fontSize={HEADER_FONT} fontWeight="bold" fontFamily="sans-serif" fill="var(--node-text)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {name}
      </text>
    </g>
  )
}
