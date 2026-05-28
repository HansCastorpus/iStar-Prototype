import { GRID, snap } from './grid.js'
import { getSlotPosition, getSideDirection } from './ports.js'

const STUB = GRID * 2
const DETOUR_PAD = GRID * 2

function nodeBox(node) {
  return { x: node.x, y: node.y, x2: node.x + node.width, y2: node.y + node.height }
}

// Liang-Barsky: returns true if segment p1→p2 enters the box interior.
// Uses strict t0 < t1 so boundary-only touches (port exits) are not counted.
function segmentCrossesBox(p1, p2, box) {
  if (p1.x === p2.x && p1.y === p2.y) return false
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const P = [-dx, dx, -dy, dy]
  const Q = [p1.x - box.x, box.x2 - p1.x, p1.y - box.y, box.y2 - p1.y]
  let t0 = 0, t1 = 1
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) {
      if (Q[i] < 0) return false
    } else {
      const r = Q[i] / P[i]
      if (P[i] < 0) { if (r > t0) t0 = r } else { if (r < t1) t1 = r }
    }
    if (t0 >= t1) return false
  }
  return t0 < t1
}

// Returns the first node whose interior any path segment crosses, or null if clear.
// Skips the source node for the first (exit) segment and target for the last (entry) segment,
// since those port segments legitimately touch node boundaries.
function firstBlocker(points, nodes, srcId, tgtId) {
  const last = points.length - 1
  for (let i = 0; i < last; i++) {
    for (const node of nodes) {
      if (i === 0 && node.id === srcId) continue
      if (i === last - 1 && node.id === tgtId) continue
      if (segmentCrossesBox(points[i], points[i + 1], nodeBox(node))) return node
    }
  }
  return null
}

// Builds the full point array between two node slots, routing around any obstacles.
// All turns are 90° — no 45° diagonals, which always create acute junction angles.
export function computePath(sourceNode, sourceSlot, targetNode, targetSlot, allNodes = {}) {
  const ps = getSlotPosition(sourceNode, sourceSlot.side, sourceSlot.offset)
  const pt = getSlotPosition(targetNode, targetSlot.side, targetSlot.offset)
  const ds = getSideDirection(sourceSlot.side)
  const dt = getSideDirection(targetSlot.side)
  const s = { x: ps.x + ds.dx * STUB, y: ps.y + ds.dy * STUB }
  const t = { x: pt.x + dt.dx * STUB, y: pt.y + dt.dy * STUB }

  const nodeArr = Object.values(allNodes)
  const srcId = sourceNode.id, tgtId = targetNode.id
  const dx = t.x - s.x, dy = t.y - s.y

  const clear = (pts) => !firstBlocker(pts, nodeArr, srcId, tgtId)

  // Reject mid-point arrays that would force a U-turn at either stub end.
  // A U-turn means the first interior point goes backward relative to the
  // source stub direction, or the last interior point approaches t from the
  // same direction as dt (so the final stub segment reverses).
  const noUturn = (mid) => {
    if (mid.length === 0) return true
    const first = mid[0], last = mid[mid.length - 1]
    if ((first.x - s.x) * ds.dx + (first.y - s.y) * ds.dy < 0) return false
    if ((t.x - last.x) * dt.dx + (t.y - last.y) * dt.dy > 0) return false
    return true
  }

  // Candidate routes, tried in order. All use only H/V segments (90° turns).
  //
  // S-bends (3 segments, balanced): split the dominant axis at its midpoint so
  // neither arm is disproportionately long. Preferred over a single L-shape.
  //
  // L-shapes (2 segments): simple single elbow, used when S-bends are blocked.
  const mx = snap((s.x + t.x) / 2)
  const my = snap((s.y + t.y) / 2)

  const candidates = dx === 0 || dy === 0
    ? [[]]   // already axis-aligned, no intermediates needed
    : [
        [{ x: mx, y: s.y }, { x: mx, y: t.y }],   // S-bend: H → V → H (x-midpoint)
        [{ x: s.x, y: my }, { x: t.x, y: my }],   // S-bend: V → H → V (y-midpoint)
        [{ x: t.x, y: s.y }],                       // L-shape: H then V
        [{ x: s.x, y: t.y }],                       // L-shape: V then H
      ]

  for (const mid of candidates) {
    if (!noUturn(mid)) continue
    const pts = [ps, s, ...mid, t, pt]
    if (clear(pts)) return pts
  }

  // All simple routes blocked — detour around the first blocking node.
  const referenceMid = candidates.find(m => noUturn(m)) ?? candidates[0]
  const blocker = firstBlocker([ps, s, ...referenceMid, t, pt], nodeArr, srcId, tgtId)
  if (blocker) {
    const bx  = blocker.x - DETOUR_PAD
    const bx2 = blocker.x + blocker.width + DETOUR_PAD
    const by  = blocker.y - DETOUR_PAD
    const by2 = blocker.y + blocker.height + DETOUR_PAD
    for (const mid of [
      [{ x: s.x, y: by },  { x: t.x, y: by }],
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

// Converts a point array to an SVG path d string.
export function pointsToPath(points) {
  if (points.length < 2) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
}

// Returns the midpoint and angle (degrees) of the middle segment, for label placement.
// The angle is normalised to (-90, 90] so text is never upside-down.
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

// Builds a preview path from a port position to an arbitrary cursor point.
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
