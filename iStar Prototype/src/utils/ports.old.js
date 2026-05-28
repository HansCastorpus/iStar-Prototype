import { GRID } from './grid.js'

export const SIDES = ['top', 'right', 'bottom', 'left']

const STUB = GRID * 2 // must match routing.js

// Position of a slot on a node's side. offset is in grid units from the center.
export function getSlotPosition(node, side, offset) {
  const cx = node.x + node.width / 2
  const cy = node.y + node.height / 2
  switch (side) {
    case 'top':    return { x: cx + offset * GRID, y: node.y }
    case 'bottom': return { x: cx + offset * GRID, y: node.y + node.height }
    case 'left':   return { x: node.x,             y: cy + offset * GRID }
    case 'right':  return { x: node.x + node.width, y: cy + offset * GRID }
  }
}

// Unit vector pointing away from the node face (exit direction).
export function getSideDirection(side) {
  switch (side) {
    case 'top':    return { dx:  0, dy: -1 }
    case 'bottom': return { dx:  0, dy:  1 }
    case 'left':   return { dx: -1, dy:  0 }
    case 'right':  return { dx:  1, dy:  0 }
  }
}

// Tries all 16 (source side × target side) combinations and picks the pair that
// produces the fewest path segments, preferring sides that face each other.
export function getBestSides(sourceNode, targetNode) {
  let best = null
  let bestScore = Infinity

  for (const ss of SIDES) {
    for (const ts of SIDES) {
      const ps = getSlotPosition(sourceNode, ss, 0)
      const pt = getSlotPosition(targetNode, ts, 0)
      const ds = getSideDirection(ss)
      const dt = getSideDirection(ts)
      const S = { x: ps.x + ds.dx * STUB, y: ps.y + ds.dy * STUB }
      const T = { x: pt.x + dt.dx * STUB, y: pt.y + dt.dy * STUB }

      const dx = T.x - S.x
      const dy = T.y - S.y

      // Penalise sides pointing the same direction (creates U-shapes / loops).
      const parallelPenalty = (ds.dx * dt.dx + ds.dy * dt.dy) > 0 ? 5 : 0

      // Penalise stubs that point away from the opposing stub endpoint (diverge).
      const divergePenalty =
        (ds.dx * dx + ds.dy * dy < 0 ? 4 : 0) +
        (dt.dx * -dx + dt.dy * -dy < 0 ? 4 : 0)

      const score = parallelPenalty
                  + divergePenalty
                  + facingPenalty(sourceNode, ss, targetNode)
                  + facingPenalty(targetNode, ts, sourceNode)

      if (score < bestScore) { bestScore = score; best = { sourceSide: ss, targetSide: ts } }
    }
  }

  return best ?? { sourceSide: 'right', targetSide: 'left' }
}

function facingPenalty(node, side, otherNode) {
  const d  = getSideDirection(side)
  const nc = { x: node.x + node.width / 2,      y: node.y + node.height / 2 }
  const oc = { x: otherNode.x + otherNode.width / 2, y: otherNode.y + otherNode.height / 2 }
  const dot = d.dx * (oc.x - nc.x) + d.dy * (oc.y - nc.y)
  return dot <= 0 ? 1 : 0
}

// Returns all offsets already claimed on a given side of a node.
export function getUsedOffsets(nodeId, side, links) {
  const used = []
  for (const link of Object.values(links)) {
    if (link.sourceId === nodeId && link.sourceSlot.side === side)
      used.push(link.sourceSlot.offset)
    if (link.targetId === nodeId && link.targetSlot.side === side)
      used.push(link.targetSlot.offset)
  }
  return used
}

// Returns the next free offset, spreading from center: 0, -1, 1, -2, 2, ...
export function getNextSlot(usedOffsets) {
  const seq = [0]
  for (let i = 1; i <= 10; i++) { seq.push(-i); seq.push(i) }
  return seq.find(o => !usedOffsets.includes(o)) ?? 0
}

// Center-of-side positions for the 4 interactive port dots shown on hover.
export function getHoverPorts(node) {
  return SIDES.map(side => ({ side, ...getSlotPosition(node, side, 0) }))
}
