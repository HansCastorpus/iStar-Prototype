import { GRID, NODE_BADGE_H } from './grid.js'

export const SIDES = ['top', 'right', 'bottom', 'left']

export const STUB = GRID * 2

// Position of a slot on a node's side. offset is in grid units from the center.
export function getSlotPosition(node, side, offset) {
  const cx = node.x + node.width / 2
  const cy = node.y + node.height / 2
  switch (side) {
    case 'top':    return { x: cx + offset * GRID, y: node.y }
    case 'bottom': return { x: cx + offset * GRID, y: node.y + node.height + NODE_BADGE_H / 2 }
    case 'left':   return { x: node.x,              y: cy + offset * GRID }
    case 'right':  return { x: node.x + node.width,  y: cy + offset * GRID }
  }
}

// Unit vector pointing away from the node face.
export function getSideDirection(side) {
  switch (side) {
    case 'top':    return { dx:  0, dy: -1 }
    case 'bottom': return { dx:  0, dy:  1 }
    case 'left':   return { dx: -1, dy:  0 }
    case 'right':  return { dx:  1, dy:  0 }
  }
}

// Determines which side of `node` the point (px, py) falls in, using 45°
// diagonal boundaries from each corner. Returns 'top' | 'right' | 'bottom' | 'left'.
export function getSideForPoint(node, px, py) {
  const cx = node.x + node.width  / 2
  const cy = node.y + node.height / 2
  const dx = px - cx
  const dy = py - cy
  // Normalise so that the diagonals fall at equal |dx| and |dy| regardless of
  // the node's aspect ratio — scale each axis by half the opposite dimension.
  const nx = dx / (node.width  / 2)
  const ny = dy / (node.height / 2)
  if (Math.abs(nx) >= Math.abs(ny)) return nx >= 0 ? 'right' : 'left'
  return ny >= 0 ? 'bottom' : 'top'
}

// Picks exit side for a link from `sourceNode` to `targetNode` and entry side
// on `targetNode`, using the geometric region test.
export function getBestSides(sourceNode, targetNode) {
  const sourceSide = getSideForPoint(sourceNode,
    targetNode.x + targetNode.width  / 2,
    targetNode.y + targetNode.height / 2)
  const targetSide = getSideForPoint(targetNode,
    sourceNode.x + sourceNode.width  / 2,
    sourceNode.y + sourceNode.height / 2)
  return { sourceSide, targetSide }
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
