import { getBestSides } from './ports.js'

const OFFSETS = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]

// Computes { sourceSlot, targetSlot } for every link in a single pass.
// Sides are chosen dynamically (closest-facing). Links sharing a side on the same
// node get distinct offsets so they never overlap.
export function computeLinkSlots(nodes, links) {
  // Pass 1 — decide the best sides for every link.
  const dynamicSides = {}
  for (const link of Object.values(links)) {
    const src = nodes[link.sourceId]
    const tgt = nodes[link.targetId]
    if (!src || !tgt) continue
    dynamicSides[link.id] = getBestSides(src, tgt)
  }

  // Pass 2 — group links by (nodeId, side) and sort stably so offsets don't flicker.
  const groups = {} // `${nodeId}/${side}` → { side, refs: [{linkId, role}] }

  for (const [linkId, { sourceSide, targetSide }] of Object.entries(dynamicSides)) {
    const link = links[linkId]
    const srcKey = `${link.sourceId}/${sourceSide}`
    const tgtKey = `${link.targetId}/${targetSide}`

    if (!groups[srcKey]) groups[srcKey] = { side: sourceSide, refs: [] }
    if (!groups[tgtKey]) groups[tgtKey] = { side: targetSide, refs: [] }
    groups[srcKey].refs.push({ linkId, role: 'source' })
    groups[tgtKey].refs.push({ linkId, role: 'target' })
  }

  // Pass 3 — assign offsets within each group (sorted by linkId for stability).
  const slots = {} // linkId → { sourceSlot, targetSlot }

  for (const { side, refs } of Object.values(groups)) {
    refs.sort((a, b) => a.linkId.localeCompare(b.linkId))
    refs.forEach(({ linkId, role }, idx) => {
      if (!slots[linkId]) slots[linkId] = {}
      const key = role === 'source' ? 'sourceSlot' : 'targetSlot'
      slots[linkId][key] = { side, offset: OFFSETS[idx] ?? idx }
    })
  }

  return slots
}
