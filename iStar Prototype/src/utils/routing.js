import { GRID, snap } from './grid.js'
import { getSlotPosition, getSideDirection, STUB } from './ports.js'

const DETOUR_PAD  = GRID * 2
const SEG_OFFSET  = 15  // px separation between overlapping parallel segments

function nodeBox(node) {
  return { x: node.x, y: node.y, x2: node.x + node.width, y2: node.y + node.height }
}

// Liang-Barsky: true if segment p1→p2 passes through the interior of box.
// Strict t0 < t1 so boundary-only grazes (port exits) are not counted.
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
      if (i === 0         && node.id === srcId) continue
      if (i === last - 1  && node.id === tgtId) continue
      if (segmentCrossesBox(points[i], points[i + 1], nodeBox(node))) return node
    }
  }
  return null
}

// ── Single-link path ──────────────────────────────────────────────────────────

function buildPath(sourceNode, sourceSlot, targetNode, targetSlot, allNodes) {
  const ps = getSlotPosition(sourceNode, sourceSlot.side, sourceSlot.offset)
  const pt = getSlotPosition(targetNode, targetSlot.side, targetSlot.offset)
  const ds = getSideDirection(sourceSlot.side)
  const dt = getSideDirection(targetSlot.side)
  const s  = { x: ps.x + ds.dx * STUB, y: ps.y + ds.dy * STUB }
  const t  = { x: pt.x + dt.dx * STUB, y: pt.y + dt.dy * STUB }

  const nodeArr = Object.values(allNodes)
  const srcId   = sourceNode.id
  const tgtId   = targetNode.id
  const dx = t.x - s.x
  const dy = t.y - s.y

  const clear    = (pts) => !firstBlocker(pts, nodeArr, srcId, tgtId)
  const noUturn  = (mid) => {
    if (mid.length === 0) return true
    const first = mid[0], last = mid[mid.length - 1]
    if ((first.x - s.x) * ds.dx + (first.y - s.y) * ds.dy < 0) return false
    if ((t.x - last.x)  * dt.dx + (t.y - last.y)  * dt.dy > 0) return false
    return true
  }

  const mx = snap((s.x + t.x) / 2)
  const my = snap((s.y + t.y) / 2)

  const candidates = dx === 0 || dy === 0
    ? [[]]
    : [
        [{ x: mx, y: s.y }, { x: mx, y: t.y }],   // S-bend H→V→H
        [{ x: s.x, y: my }, { x: t.x, y: my }],   // S-bend V→H→V
        [{ x: t.x, y: s.y }],                       // L-shape H then V
        [{ x: s.x, y: t.y }],                       // L-shape V then H
      ]

  for (const mid of candidates) {
    if (!noUturn(mid)) continue
    const pts = [ps, s, ...mid, t, pt]
    if (clear(pts)) return pts
  }

  // Detour around the first blocker.
  const referenceMid = candidates.find(m => noUturn(m)) ?? candidates[0]
  const blocker = firstBlocker([ps, s, ...referenceMid, t, pt], nodeArr, srcId, tgtId)
  if (blocker) {
    const bx  = blocker.x - DETOUR_PAD
    const bx2 = blocker.x + blocker.width  + DETOUR_PAD
    const by  = blocker.y - DETOUR_PAD
    const by2 = blocker.y + blocker.height + DETOUR_PAD
    for (const mid of [
      [{ x: s.x, y: by  }, { x: t.x, y: by  }],
      [{ x: s.x, y: by2 }, { x: t.x, y: by2 }],
      [{ x: bx,  y: s.y }, { x: bx,  y: t.y }],
      [{ x: bx2, y: s.y }, { x: bx2, y: t.y }],
    ]) {
      const pts = [ps, s, ...mid, t, pt]
      if (clear(pts)) return pts
    }
  }

  return [ps, s, ...referenceMid, t, pt]
}

// ── Segment-overlap separation ────────────────────────────────────────────────
// After all paths are built, find pairs of collinear overlapping middle segments
// (excluding the first and last stub segments) and nudge them apart by SEG_OFFSET.

function segKey(p1, p2) {
  if (p1.x === p2.x) return { axis: 'v', coord: p1.x, lo: Math.min(p1.y, p2.y), hi: Math.max(p1.y, p2.y) }
  if (p1.y === p2.y) return { axis: 'h', coord: p1.y, lo: Math.min(p1.x, p2.x), hi: Math.max(p1.x, p2.x) }
  return null
}

function overlaps(a, b) {
  return a.axis === b.axis && a.coord === b.coord && a.lo < b.hi && b.lo < a.hi
}

// Applies perpendicular nudges to middle segments that share a corridor.
// pathMap: { linkId → points[] }  (mutated in-place)
function separateOverlaps(pathMap) {
  // Collect all middle segments (exclude index 0 and last-1, which are stubs).
  const segs = []
  for (const [linkId, pts] of Object.entries(pathMap)) {
    for (let i = 1; i < pts.length - 2; i++) {
      const k = segKey(pts[i], pts[i + 1])
      if (k) segs.push({ linkId, i, k })
    }
  }

  // Group by overlapping sets and distribute offsets symmetrically.
  const visited = new Set()
  for (let a = 0; a < segs.length; a++) {
    if (visited.has(a)) continue
    const group = [a]
    for (let b = a + 1; b < segs.length; b++) {
      if (overlaps(segs[a].k, segs[b].k)) group.push(b)
    }
    if (group.length === 1) continue

    // Distribute: centre the group around the original coordinate.
    const n     = group.length
    const total = (n - 1) * SEG_OFFSET
    group.forEach((idx, pos) => {
      visited.add(idx)
      const { linkId, i, k } = segs[idx]
      const pts   = pathMap[linkId]
      const delta = -total / 2 + pos * SEG_OFFSET

      if (k.axis === 'h') {
        pts[i]     = { ...pts[i],     y: pts[i].y     + delta }
        pts[i + 1] = { ...pts[i + 1], y: pts[i + 1].y + delta }
      } else {
        pts[i]     = { ...pts[i],     x: pts[i].x     + delta }
        pts[i + 1] = { ...pts[i + 1], x: pts[i + 1].x + delta }
      }
    })
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

// Computes routed paths for all links at once, with overlap separation applied.
// Returns { linkId → points[] }.
export function computeAllPaths(nodes, linkSlots, links) {
  const pathMap = {}
  for (const link of Object.values(links)) {
    const src = nodes[link.sourceId]
    const tgt = nodes[link.targetId]
    if (!src || !tgt) continue
    const slots = linkSlots[link.id]
    if (!slots) continue
    pathMap[link.id] = buildPath(src, slots.sourceSlot, tgt, slots.targetSlot, nodes)
  }
  separateOverlaps(pathMap)
  return pathMap
}

// Converts a point array to an SVG path d string.
export function pointsToPath(points) {
  if (points.length < 2) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
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
