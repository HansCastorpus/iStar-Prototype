import { GRID, snap } from './grid.js'
import { getSlotPosition, getSideDirection, STUB } from './ports.js'

const DETOUR_PAD    = GRID * 2
const SEG_OFFSET    = 15   // px separation between overlapping parallel segments
const CORNER_RADIUS = 15   // px radius for rounded corners
const MIN_DIAGONAL  = GRID * 3  // minimum diagonal segment length before falling back to H/V

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

// Returns intermediate points between s and t that make the path strictly
// octilinear. The 45° diagonal is always exact; H or V segments absorb the excess.
function octilinearMid(s, t) {
  const dx  = t.x - s.x
  const dy  = t.y - s.y
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (adx === 0 || ady === 0) return []
  if (adx === ady)            return []
  const sx = dx > 0 ? 1 : -1
  const sy = dy > 0 ? 1 : -1
  if (adx > ady) {
    const half = (adx - ady) / 2
    return [{ x: s.x + half * sx, y: s.y }, { x: t.x - half * sx, y: t.y }]
  } else {
    const half = (ady - adx) / 2
    return [{ x: s.x, y: s.y + half * sy }, { x: t.x, y: t.y - half * sy }]
  }
}

// Removes any interior point that is collinear with its neighbours (same x or
// same y throughout). This merges the stub into the first connector segment
// whenever they run in the same direction, eliminating tiny visual segments.
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
  const clear = (pts) => !firstBlocker(pts, nodeArr, srcId, tgtId)

  // Primary: octilinear path — all segments at 0°, 45°, or 90°.
  // The diagonal is always exactly 45°; H/V segments absorb the excess.
  //   wider than tall  →  H → 45° diagonal → H
  //   taller than wide →  V → 45° diagonal → V
  //   equal            →  pure 45° diagonal
  // Only use the diagonal when its length clears the minimum threshold.
  // min(|dx|, |dy|) × √2 is the pixel length of the 45° segment.
  const diagLen = Math.min(Math.abs(t.x - s.x), Math.abs(t.y - s.y)) * Math.SQRT2
  if (diagLen >= MIN_DIAGONAL) {
    const primary = removeCollinear([ps, s, ...octilinearMid(s, t), t, pt])
    if (clear(primary)) return primary
  }

  // Fallback: axis-aligned routes when diagonal is too short or blocked.
  const dx = t.x - s.x
  const dy = t.y - s.y
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
    const pts = [ps, s, ...mid, t, pt]
    if (clear(pts)) return pts
  }

  // Detour around the first blocker.
  const referenceMid = candidates[0]
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
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  if (dx === 0) return { axis: 'v',  coord: p1.x,       lo: Math.min(p1.y, p2.y), hi: Math.max(p1.y, p2.y) }
  if (dy === 0) return { axis: 'h',  coord: p1.y,       lo: Math.min(p1.x, p2.x), hi: Math.max(p1.x, p2.x) }
  if (Math.abs(dx) === Math.abs(dy)) {
    // Exactly 45° diagonal. Use the line's intercept as coord.
    // +45° (slope +1): y − x = const   −45° (slope −1): y + x = const
    const axis  = dx * dy > 0 ? 'd+' : 'd-'
    const coord = dx * dy > 0 ? p1.y - p1.x : p1.y + p1.x
    return { axis, coord, lo: Math.min(p1.x, p2.x), hi: Math.max(p1.x, p2.x) }
  }
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
      } else if (k.axis === 'v') {
        pts[i]     = { ...pts[i],     x: pts[i].x     + delta }
        pts[i + 1] = { ...pts[i + 1], x: pts[i + 1].x + delta }
      } else if (k.axis === 'd+') {
        // Perpendicular to +45° is (−1, +1)/√2
        const d = delta / Math.SQRT2
        pts[i]     = { x: pts[i].x     - d, y: pts[i].y     + d }
        pts[i + 1] = { x: pts[i + 1].x - d, y: pts[i + 1].y + d }
      } else if (k.axis === 'd-') {
        // Perpendicular to −45° is (+1, +1)/√2
        const d = delta / Math.SQRT2
        pts[i]     = { x: pts[i].x     + d, y: pts[i].y     + d }
        pts[i + 1] = { x: pts[i + 1].x + d, y: pts[i + 1].y + d }
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

// Converts a point array to an SVG path d string with rounded corners.
// Each interior vertex is replaced by a quadratic bezier of radius CORNER_RADIUS.
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

  const last = points[points.length - 1]
  d += ` L${last.x},${last.y}`
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
