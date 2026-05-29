import { GRID, snap } from './grid.js'
import { getSlotPosition, getSideDirection, STUB } from './ports.js'

const DETOUR_PAD    = GRID * 2
const SEG_OFFSET    = 8    // px separation between overlapping parallel segments
const CORNER_RADIUS = 15   // px radius for rounded corners
// Diagonal route fires only when both dx and dy between stub-ends are at least
// MIN_DIAGONAL / √2.  Small offsets always use H/V; large diagonal offsets use 45°.
const MIN_DIAGONAL  = GRID * 6  // 60px — diagonal fires when min(|dx|,|dy|) ≥ ~42px

function nodeBox(node) {
  return { x: node.x, y: node.y, x2: node.x + node.width, y2: node.y + node.height }
}

// Liang-Barsky: true if segment p1→p2 passes through the interior of box.
function segmentCrossesBox(p1, p2, box) {
  if (p1.x === p2.x && p1.y === p2.y) return false
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const P = [-dx, dx, -dy, dy]
  const Q = [p1.x - box.x, box.x2 - p1.x, p1.y - box.y, box.y2 - p1.y]
  let t0 = 0, t1 = 1
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) { if (Q[i] < 0) return false }
    else {
      const r = Q[i] / P[i]
      if (P[i] < 0) { if (r > t0) t0 = r } else { if (r < t1) t1 = r }
    }
    if (t0 >= t1) return false
  }
  return t0 < t1
}

function firstBlocker(points, nodes, srcId, tgtId) {
  const last = points.length - 1
  for (let i = 0; i < last; i++) {
    for (const node of nodes) {
      if (i === 0        && node.id === srcId) continue
      if (i === last - 1 && node.id === tgtId) continue
      if (segmentCrossesBox(points[i], points[i + 1], nodeBox(node))) return node
    }
  }
  return null
}

// ── Crossing detection ────────────────────────────────────────────────────────

function cross2D(O, A, B) {
  return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x)
}

// True if segments AB and CD properly cross (interior intersection, not touching at endpoints).
function segmentsProperlyIntersect(A, B, C, D) {
  const d1 = cross2D(C, D, A), d2 = cross2D(C, D, B)
  const d3 = cross2D(A, B, C), d4 = cross2D(A, B, D)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

// Count how many times a path crosses a set of existing segments.
function countCrossings(pts, existingSegs) {
  let n = 0
  for (let i = 0; i < pts.length - 1; i++)
    for (const { p1, p2 } of existingSegs)
      if (segmentsProperlyIntersect(pts[i], pts[i + 1], p1, p2)) n++
  return n
}

// Flatten a point array into segments carrying the link and node IDs.
function pathToSegs(pts, linkId, srcId, tgtId) {
  const out = []
  for (let i = 0; i < pts.length - 1; i++)
    out.push({ p1: pts[i], p2: pts[i + 1], linkId, srcId, tgtId })
  return out
}

// ── Octilinear helpers ────────────────────────────────────────────────────────

function octilinearMid(s, t) {
  const dx  = t.x - s.x, dy  = t.y - s.y
  const adx = Math.abs(dx),  ady = Math.abs(dy)
  if (adx === 0 || ady === 0) return []
  if (adx === ady)            return []
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1
  if (adx > ady) {
    const half = (adx - ady) / 2
    return [{ x: s.x + half * sx, y: s.y }, { x: t.x - half * sx, y: t.y }]
  } else {
    const half = (ady - adx) / 2
    return [{ x: s.x, y: s.y + half * sy }, { x: t.x, y: t.y - half * sy }]
  }
}

function removeCollinear(pts) {
  if (pts.length <= 2) return pts
  const out = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], B = pts[i], C = pts[i + 1]
    const collinear = (A.x === B.x && B.x === C.x) || (A.y === B.y && B.y === C.y)
    if (!collinear) out.push(B)
  }
  out.push(pts[pts.length - 1])
  return out
}

const SIMPLIFY_THRESHOLD = 3  // px — drop bends smaller than this (must be < ALIGN_SNAP/2)

function simplifyPoints(pts) {
  if (pts.length <= 2) return pts
  const out = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], B = pts[i], C = pts[i + 1]
    const dx = C.x - A.x, dy = C.y - A.y
    const len = Math.hypot(dx, dy)
    const dist = len === 0
      ? Math.hypot(B.x - A.x, B.y - A.y)
      : Math.abs((B.x - A.x) * dy - (B.y - A.y) * dx) / len
    if (dist > SIMPLIFY_THRESHOLD) out.push(B)
  }
  out.push(pts[pts.length - 1])
  return out.length < pts.length ? simplifyPoints(out) : out
}

// ── Single-link path ──────────────────────────────────────────────────────────

// Builds all obstacle-free candidate paths, then picks the one with fewest
// crossings against already-routed links. Falls back to detour if all blocked.
function buildPath(sourceNode, sourceSlot, targetNode, targetSlot, allNodes, existingSegs) {
  const ps = getSlotPosition(sourceNode, sourceSlot.side, sourceSlot.offset)
  const pt = getSlotPosition(targetNode, targetSlot.side, targetSlot.offset)
  const ds = getSideDirection(sourceSlot.side)
  const dt = getSideDirection(targetSlot.side)
  let s  = { x: ps.x + ds.dx * STUB, y: ps.y + ds.dy * STUB }
  let t  = { x: pt.x + dt.dx * STUB, y: pt.y + dt.dy * STUB }

  // When opposing stubs cross (nodes very close), clamp both to the midpoint
  // between the two ports so the path never folds back on itself.
  if (ds.dy !== 0 && ds.dy === -dt.dy) {
    const midY = (ps.y + pt.y) / 2
    s = { ...s, y: ds.dy > 0 ? Math.min(s.y, midY) : Math.max(s.y, midY) }
    t = { ...t, y: dt.dy > 0 ? Math.min(t.y, midY) : Math.max(t.y, midY) }
  }
  if (ds.dx !== 0 && ds.dx === -dt.dx) {
    const midX = (ps.x + pt.x) / 2
    s = { ...s, x: ds.dx > 0 ? Math.min(s.x, midX) : Math.max(s.x, midX) }
    t = { ...t, x: dt.dx > 0 ? Math.min(t.x, midX) : Math.max(t.x, midX) }
  }

  const nodeArr = Object.values(allNodes)
  const srcId   = sourceNode.id, tgtId = targetNode.id
  const clear   = (pts) => !firstBlocker(pts, nodeArr, srcId, tgtId)
  const score   = (pts) => countCrossings(pts, existingSegs)

  const dx = t.x - s.x, dy = t.y - s.y
  const mx = snap((s.x + t.x) / 2), my = snap((s.y + t.y) / 2)

  // Gather all clear candidates.
  const pool = []

  const diagLen = Math.min(Math.abs(dx), Math.abs(dy)) * Math.SQRT2
  if (diagLen >= MIN_DIAGONAL) {
    const p = removeCollinear([ps, s, ...octilinearMid(s, t), t, pt])
    if (clear(p)) pool.push(p)
  }

  const lMids = [          // L-shape: 1 bend → 3 segments after simplification
    [{ x: t.x, y: s.y }],
    [{ x: s.x, y: t.y }],
  ]
  const sMids = [          // S-shape: 2 bends — fallback only
    [{ x: mx, y: s.y }, { x: mx, y: t.y }],
    [{ x: s.x, y: my }, { x: t.x, y: my }],
  ]

  // Below the diagonal threshold use L-shapes only; S-shapes are a last resort.
  const inCloseZone = dx !== 0 && dy !== 0 && diagLen < MIN_DIAGONAL
  const hvMids = dx === 0 || dy === 0 ? [[]] : inCloseZone ? lMids : [...lMids, ...sMids]

  for (const mid of hvMids) {
    const p = [ps, s, ...mid, t, pt]
    if (clear(p)) pool.push(p)
  }

  // Close-zone fallback: if both L-shapes are blocked, allow S-shapes.
  if (inCloseZone && pool.length === 0) {
    for (const mid of sMids) {
      const p = [ps, s, ...mid, t, pt]
      if (clear(p)) pool.push(p)
    }
  }

  // Helper: add detour candidates around a node's bounding box.
  const addDetours = (node) => {
    const bx  = node.x - DETOUR_PAD, bx2 = node.x + node.width  + DETOUR_PAD
    const by  = node.y - DETOUR_PAD, by2 = node.y + node.height + DETOUR_PAD
    for (const mid of [
      [{ x: s.x, y: by  }, { x: t.x, y: by  }],
      [{ x: s.x, y: by2 }, { x: t.x, y: by2 }],
      [{ x: bx,  y: s.y }, { x: bx,  y: t.y }],
      [{ x: bx2, y: s.y }, { x: bx2, y: t.y }],
    ]) {
      const p = [ps, s, ...mid, t, pt]
      if (clear(p)) pool.push(p)
    }
  }

  if (pool.length > 0) {
    const best = pool.reduce((b, p) => score(p) < score(b) ? p : b)
    if (score(best) > 0) {
      const crossedNodeIds = new Set()
      let cbx = Infinity, cbx2 = -Infinity, cby = Infinity, cby2 = -Infinity

      for (let i = 0; i < best.length - 1; i++) {
        for (const seg of existingSegs) {
          if (segmentsProperlyIntersect(best[i], best[i + 1], seg.p1, seg.p2)) {
            if (seg.srcId) crossedNodeIds.add(seg.srcId)
            if (seg.tgtId) crossedNodeIds.add(seg.tgtId)
            cbx  = Math.min(cbx,  seg.p1.x, seg.p2.x)
            cbx2 = Math.max(cbx2, seg.p1.x, seg.p2.x)
            cby  = Math.min(cby,  seg.p1.y, seg.p2.y)
            cby2 = Math.max(cby2, seg.p1.y, seg.p2.y)
          }
        }
      }

      // Detour around endpoint nodes of crossed links.
      for (const nodeId of crossedNodeIds) {
        const node = allNodes[nodeId]
        if (!node || nodeId === srcId || nodeId === tgtId) continue
        addDetours(node)
      }

      // Detour around the bounding box of the crossed segments themselves —
      // more targeted than going around the distant endpoint nodes.
      if (cbx !== Infinity) {
        const px  = cbx  - DETOUR_PAD, px2 = cbx2 + DETOUR_PAD
        const py  = cby  - DETOUR_PAD, py2 = cby2 + DETOUR_PAD
        for (const mid of [
          [{ x: s.x, y: py  }, { x: t.x, y: py  }],
          [{ x: s.x, y: py2 }, { x: t.x, y: py2 }],
          [{ x: px,  y: s.y }, { x: px,  y: t.y }],
          [{ x: px2, y: s.y }, { x: px2, y: t.y }],
        ]) {
          const p = [ps, s, ...mid, t, pt]
          if (clear(p)) pool.push(p)
        }
      }
    }
    return pool.reduce((b, p) => score(p) < score(b) ? p : b)
  }

  // All simple routes blocked by nodes — try physical detours.
  const referenceMid = hvMids[0]
  const blocker = firstBlocker([ps, s, ...referenceMid, t, pt], nodeArr, srcId, tgtId)
  if (blocker) {
    addDetours(blocker)
    if (pool.length > 0)
      return pool.reduce((b, p) => score(p) < score(b) ? p : b)
  }

  return [ps, s, ...referenceMid, t, pt]
}

// ── Segment-overlap separation ────────────────────────────────────────────────

function segKey(p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  if (dx === 0) return { axis: 'v',  coord: p1.x,       lo: Math.min(p1.y, p2.y), hi: Math.max(p1.y, p2.y) }
  if (dy === 0) return { axis: 'h',  coord: p1.y,       lo: Math.min(p1.x, p2.x), hi: Math.max(p1.x, p2.x) }
  if (Math.abs(dx) === Math.abs(dy)) {
    const axis  = dx * dy > 0 ? 'd+' : 'd-'
    const coord = dx * dy > 0 ? p1.y - p1.x : p1.y + p1.x
    return { axis, coord, lo: Math.min(p1.x, p2.x), hi: Math.max(p1.x, p2.x) }
  }
  return null
}

const OVERLAP_TOLERANCE = 4  // px — segments within this distance share a line

function overlaps(a, b) {
  return a.axis === b.axis && Math.abs(a.coord - b.coord) <= OVERLAP_TOLERANCE && a.lo < b.hi && b.lo < a.hi
}

function separateOverlaps(pathMap) {
  const segs = []
  for (const [linkId, pts] of Object.entries(pathMap)) {
    for (let i = 1; i < pts.length - 2; i++) {
      const k = segKey(pts[i], pts[i + 1])
      if (k) segs.push({ linkId, i, k })
    }
  }

  const visited = new Set()
  for (let a = 0; a < segs.length; a++) {
    if (visited.has(a)) continue
    const group = [a]
    for (let b = a + 1; b < segs.length; b++) {
      if (overlaps(segs[a].k, segs[b].k)) group.push(b)
    }
    if (group.length === 1) continue

    const n = group.length, total = (n - 1) * SEG_OFFSET
    group.forEach((idx, pos) => {
      visited.add(idx)
      const { linkId, i, k } = segs[idx]
      const pts  = pathMap[linkId]
      const delta = -total / 2 + pos * SEG_OFFSET
      if (k.axis === 'h') {
        pts[i]     = { ...pts[i],     y: pts[i].y     + delta }
        pts[i + 1] = { ...pts[i + 1], y: pts[i + 1].y + delta }
      } else if (k.axis === 'v') {
        pts[i]     = { ...pts[i],     x: pts[i].x     + delta }
        pts[i + 1] = { ...pts[i + 1], x: pts[i + 1].x + delta }
      } else if (k.axis === 'd+') {
        const d = delta / Math.SQRT2
        pts[i]     = { x: pts[i].x     - d, y: pts[i].y     + d }
        pts[i + 1] = { x: pts[i + 1].x - d, y: pts[i + 1].y + d }
      } else if (k.axis === 'd-') {
        const d = delta / Math.SQRT2
        pts[i]     = { x: pts[i].x     + d, y: pts[i].y     + d }
        pts[i + 1] = { x: pts[i + 1].x + d, y: pts[i + 1].y + d }
      }
    })
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

// Stub-to-stub Euclidean distance — used to sort links shortest-first.
function stubDist(nodes, linkSlots, link) {
  const src = nodes[link.sourceId], tgt = nodes[link.targetId]
  const slots = linkSlots[link.id]
  if (!src || !tgt || !slots) return Infinity
  const ds = getSideDirection(slots.sourceSlot.side)
  const dt = getSideDirection(slots.targetSlot.side)
  const ps = getSlotPosition(src, slots.sourceSlot.side, slots.sourceSlot.offset)
  const pt = getSlotPosition(tgt, slots.targetSlot.side, slots.targetSlot.offset)
  return Math.hypot(
    (pt.x + dt.dx * STUB) - (ps.x + ds.dx * STUB),
    (pt.y + dt.dy * STUB) - (ps.y + ds.dy * STUB)
  )
}

// ── Post-routing slot alignment ───────────────────────────────────────────────

// After routing, the actual path shapes tell us the true spatial order of links
// on each node face. If that order disagrees with the current slot offsets, fix
// the offsets and re-route the affected links.
//
// "Far endpoint" position:
//   source role → last point of path (on the target node)
//   target role → first point of path (on the source node)
// This gives the x/y of wherever the link "comes from or goes to", independent
// of detours, and is a reliable indicator of which slot it should occupy.
function alignSlots(nodes, mutableSlots, linkList, pathMap, existingSegs) {
  const groups = {}
  for (const link of linkList) {
    const slots = mutableSlots[link.id]
    if (!slots) continue
    const srcKey = `${link.sourceId}/${slots.sourceSlot.side}`
    const tgtKey = `${link.targetId}/${slots.targetSlot.side}`
    if (!groups[srcKey]) groups[srcKey] = []
    groups[srcKey].push({ linkId: link.id, role: 'source' })
    if (!groups[tgtKey]) groups[tgtKey] = []
    groups[tgtKey].push({ linkId: link.id, role: 'target' })
  }

  const changedLinks = new Set()

  for (const [groupKey, refs] of Object.entries(groups)) {
    if (refs.length < 2) continue

    const side = groupKey.split('/')[1]
    const horizontal = side === 'top' || side === 'bottom'

    const withPos = refs.map(ref => {
      const pts = pathMap[ref.linkId]
      if (!pts || pts.length < 2) return { ref, pos: 0 }
      const farPt = ref.role === 'source' ? pts[pts.length - 1] : pts[0]
      return { ref, pos: horizontal ? farPt.x : farPt.y }
    })

    // Ascending position order (left→right or top→bottom)
    const byPos = [...withPos].sort((a, b) => a.pos - b.pos)

    // Ascending offset order (most-negative → most-positive)
    const byOffset = [...refs].sort((a, b) => {
      const ka = a.role === 'source' ? 'sourceSlot' : 'targetSlot'
      const kb = b.role === 'source' ? 'sourceSlot' : 'targetSlot'
      return mutableSlots[a.linkId][ka].offset - mutableSlots[b.linkId][kb].offset
    })

    // If the two orderings already agree, nothing to do.
    if (byPos.every((x, i) => x.ref.linkId === byOffset[i].linkId)) continue

    // Re-assign: the i-th smallest far-end position gets the i-th smallest offset.
    const sortedOffsets = byOffset.map(r => {
      const k = r.role === 'source' ? 'sourceSlot' : 'targetSlot'
      return mutableSlots[r.linkId][k].offset
    })

    byPos.forEach(({ ref }, i) => {
      const k = ref.role === 'source' ? 'sourceSlot' : 'targetSlot'
      const newOffset = sortedOffsets[i]
      if (mutableSlots[ref.linkId][k].offset !== newOffset) {
        mutableSlots[ref.linkId] = {
          ...mutableSlots[ref.linkId],
          [k]: { ...mutableSlots[ref.linkId][k], offset: newOffset },
        }
        changedLinks.add(ref.linkId)
      }
    })
  }

  if (changedLinks.size === 0) return false

  // Re-route only the links whose slots changed, in original shortest-first order.
  for (const link of linkList) {
    if (!changedLinks.has(link.id)) continue
    const slots  = mutableSlots[link.id]
    const others = existingSegs.filter(s => s.linkId !== link.id)
    const newPts = buildPath(
      nodes[link.sourceId], slots.sourceSlot,
      nodes[link.targetId], slots.targetSlot,
      nodes, others)
    pathMap[link.id] = newPts
    const filtered = existingSegs.filter(s => s.linkId !== link.id)
    existingSegs.length = 0
    existingSegs.push(...filtered,
      ...pathToSegs(newPts, link.id, link.sourceId, link.targetId))
  }

  return true
}

// Re-route every link that still crosses others, now with full knowledge of all
// paths. Runs up to 2 passes; shorter links (routed first) keep their direct
// paths — longer links must detour around them.
function reroutePass(nodes, mutableSlots, linkList, pathMap, existingSegs) {
  for (let pass = 0; pass < 2; pass++) {
    let improved = false
    for (const link of linkList) {
      const segsOthers = existingSegs.filter(s => s.linkId !== link.id)
      const currentCross = countCrossings(pathMap[link.id], segsOthers)
      if (currentCross === 0) continue

      const slots = mutableSlots[link.id]
      const newPts = buildPath(
        nodes[link.sourceId], slots.sourceSlot,
        nodes[link.targetId], slots.targetSlot,
        nodes, segsOthers)

      if (countCrossings(newPts, segsOthers) < currentCross) {
        pathMap[link.id] = newPts
        const filtered = existingSegs.filter(s => s.linkId !== link.id)
        existingSegs.length = 0
        existingSegs.push(...filtered,
          ...pathToSegs(newPts, link.id, link.sourceId, link.targetId))
        improved = true
      }
    }
    if (!improved) break
  }
}

// Routes all links, shortest first, each one aware of already-routed paths.
// Returns { linkId → points[] }.
export function computeAllPaths(nodes, linkSlots, links) {
  const linkList = Object.values(links)
    .filter(l => nodes[l.sourceId] && nodes[l.targetId] && linkSlots[l.id])
    .sort((a, b) => stubDist(nodes, linkSlots, a) - stubDist(nodes, linkSlots, b))

  const mutableSlots = {}
  for (const link of linkList) mutableSlots[link.id] = linkSlots[link.id]

  const pathMap = {}
  const existingSegs = []

  for (const link of linkList) {
    const src   = nodes[link.sourceId], tgt = nodes[link.targetId]
    const slots = mutableSlots[link.id]
    const pts   = buildPath(src, slots.sourceSlot, tgt, slots.targetSlot, nodes, existingSegs)
    pathMap[link.id] = pts
    existingSegs.push(...pathToSegs(pts, link.id, link.sourceId, link.targetId))
  }

  // Align slot positions to actual path directions; run twice to catch cascades.
  if (alignSlots(nodes, mutableSlots, linkList, pathMap, existingSegs))
    alignSlots(nodes, mutableSlots, linkList, pathMap, existingSegs)
  reroutePass(nodes, mutableSlots, linkList, pathMap, existingSegs)
  separateOverlaps(pathMap)
  for (const id of Object.keys(pathMap)) pathMap[id] = simplifyPoints(pathMap[id])
  return pathMap
}

// Converts a point array to an SVG path d string with rounded corners.
export function pointsToPath(points) {
  if (points.length < 2) return ''

  function approach(from, to, d) {
    const dx = to.x - from.x, dy = to.y - from.y
    const len = Math.hypot(dx, dy)
    if (len === 0) return from
    return { x: from.x + dx / len * d, y: from.y + dy / len * d }
  }

  let d = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const A = points[i - 1], B = points[i], C = points[i + 1]
    const cr = Math.min(CORNER_RADIUS, Math.hypot(B.x-A.x, B.y-A.y) / 2, Math.hypot(C.x-B.x, C.y-B.y) / 2)
    const p1 = approach(B, A, cr)
    const p2 = approach(B, C, cr)
    d += ` L${p1.x},${p1.y} Q${B.x},${B.y} ${p2.x},${p2.y}`
  }
  d += ` L${points[points.length - 1].x},${points[points.length - 1].y}`
  return d
}

// Returns the midpoint and angle (degrees) of the middle segment, for label placement.
export function getMidSegment(points) {
  if (points.length < 2) return { mid: { x: 0, y: 0 }, angle: 0 }
  const i  = Math.floor((points.length - 1) / 2)
  const p1 = points[i], p2 = points[i + 1]
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI
  if (angle >  90) angle -= 180
  if (angle < -90) angle += 180
  return { mid, angle }
}

function polylineLength(points) {
  let len = 0
  for (let i = 1; i < points.length; i++)
    len += Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y)
  return len
}

// Returns {x, y, angle} at fractional position t (0=source end, 1=target end).
export function getPointAtT(points, t) {
  if (points.length < 2) return { x: 0, y: 0, angle: 0 }
  t = Math.max(0, Math.min(1, t))
  const total  = polylineLength(points)
  const target = t * total
  let walked   = 0
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1], p2 = points[i]
    const seg = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    if (walked + seg >= target || i === points.length - 1) {
      const frac = seg === 0 ? 0 : (target - walked) / seg
      const x = p1.x + (p2.x - p1.x) * frac
      const y = p1.y + (p2.y - p1.y) * frac
      let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI
      if (angle >  90) angle -= 180
      if (angle < -90) angle += 180
      return { x, y, angle }
    }
    walked += seg
  }
  const last = points[points.length - 1]
  return { x: last.x, y: last.y, angle: 0 }
}

// Project world point (px, py) onto the polyline; returns t ∈ [0.05, 0.95].
export function projectOntoPath(points, px, py) {
  if (points.length < 2) return 0.5
  const total = polylineLength(points)
  if (total === 0) return 0.5
  let bestT = 0.5, bestDist = Infinity, walked = 0
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1], p2 = points[i]
    const dx = p2.x - p1.x, dy = p2.y - p1.y
    const seg = Math.hypot(dx, dy)
    const frac = seg === 0 ? 0 : Math.max(0, Math.min(1,
      ((px - p1.x) * dx + (py - p1.y) * dy) / (seg * seg)))
    const cx = p1.x + dx * frac, cy = p1.y + dy * frac
    const dist = Math.hypot(px - cx, py - cy)
    if (dist < bestDist) { bestDist = dist; bestT = (walked + frac * seg) / total }
    walked += seg
  }
  return Math.max(0.05, Math.min(0.95, bestT))
}

// Preview path while dragging a new connection.
export function computePreviewPath(sourceNode, sourceSide, cursorWorld) {
  const ds = getSideDirection(sourceSide)
  const ps = getSlotPosition(sourceNode, sourceSide, 0)
  const s  = { x: ps.x + ds.dx * STUB, y: ps.y + ds.dy * STUB }
  const elbow = (s.x === cursorWorld.x || s.y === cursorWorld.y)
    ? []
    : ds.dx !== 0
      ? [{ x: cursorWorld.x, y: s.y }]
      : [{ x: s.x, y: cursorWorld.y }]
  return [ps, s, ...elbow, cursorWorld]
}
