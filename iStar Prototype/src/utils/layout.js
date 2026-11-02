import { getBestSides } from './ports.js'

// An end the user dragged to another spot (link.sourceAnchor / link.targetAnchor = { side, offset }) stays where it was put
// until one of its elements moves (the store then drops it, see clearSlotOverrides)

// Computes { sourceSlot, targetSlot } for every link.
//
// Slot offsets within a side are assigned in spatial order so links never
// need to cross each other at their entry/exit points:
//   - top/bottom sides  → sorted by other-node center x (left → negative offset)
//   - left/right sides  → sorted by other-node center y (top  → negative offset)
export function computeLinkSlots(nodes, links) {
  // Pass 1 — geometric side selection for every link.
  const sides = {}
  for (const link of Object.values(links)) {
    const src = nodes[link.sourceId]
    const tgt = nodes[link.targetId]
    if (!src || !tgt) continue
    sides[link.id] = getBestSides(src, tgt)
    if (link.sourceAnchor) sides[link.id].sourceSide = link.sourceAnchor.side
    if (link.targetAnchor) sides[link.id].targetSide = link.targetAnchor.side
  }

  // Pass 2 — group link-endpoint references by (nodeId, side).
  // Each ref carries the center of the *other* node for spatial sorting.
  const groups = {}
  for (const [linkId, { sourceSide, targetSide }] of Object.entries(sides)) {
    const link  = links[linkId]
    const src   = nodes[link.sourceId]
    const tgt   = nodes[link.targetId]
    if (!src || !tgt) continue

    const srcKey = `${link.sourceId}/${sourceSide}`
    const tgtKey = `${link.targetId}/${targetSide}`

    if (!groups[srcKey]) groups[srcKey] = { side: sourceSide, nodeId: link.sourceId, refs: [] }
    if (!groups[tgtKey]) groups[tgtKey] = { side: targetSide, nodeId: link.targetId, refs: [] }

    const tcx = tgt.x + tgt.width  / 2
    const tcy = tgt.y + tgt.height / 2
    const scx = src.x + src.width  / 2
    const scy = src.y + src.height / 2

    groups[srcKey].refs.push({ linkId, role: 'source', otherX: tcx, otherY: tcy,
      fixedOffset: link.sourceAnchor ? link.sourceAnchor.offset : null })
    groups[tgtKey].refs.push({ linkId, role: 'target', otherX: scx, otherY: scy,
      fixedOffset: link.targetAnchor ? link.targetAnchor.offset : null })
  }

  // Pass 3 — assign offsets spatially within each group.
  // Sort by the other node's position along the side's perpendicular axis so
  // links never need to cross each other at entry/exit points.
  // Offsets are distributed symmetrically around 0 (the side center):
  //   n=1 → [0]   n=2 → [-0.5, 0.5]   n=3 → [-1, 0, 1]   etc.
  const slots = {}

  for (const { side, refs } of Object.values(groups)) {
    const horizontal = side === 'top' || side === 'bottom'
    refs.sort((a, b) => horizontal ? a.otherX - b.otherX : a.otherY - b.otherY)

    // Ends placed by hand keep their offset; the others share the remaining evenly spaced positions
    const n = refs.length
    const positions = refs.map((_, idx) => idx - (n - 1) / 2)
    for (const r of refs) {
      if (r.fixedOffset == null) continue
      let best = -1
      positions.forEach((pos, i) => { if (best < 0 || Math.abs(pos - r.fixedOffset) < Math.abs(positions[best] - r.fixedOffset)) best = i })
      positions.splice(best, 1)
    }
    refs.filter(r => r.fixedOffset == null).forEach(({ linkId, role }, idx) => {
      if (!slots[linkId]) slots[linkId] = {}
      const key = role === 'source' ? 'sourceSlot' : 'targetSlot'
      slots[linkId][key] = { side, offset: positions[idx] }
    })
    for (const r of refs) {
      if (r.fixedOffset == null) continue
      if (!slots[r.linkId]) slots[r.linkId] = {}
      slots[r.linkId][r.role === 'source' ? 'sourceSlot' : 'targetSlot'] = { side, offset: r.fixedOffset }
    }
  }

  return slots
}
