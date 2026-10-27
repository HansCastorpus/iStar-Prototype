// Walking "upstream" from an element: the elements whose links point into it, then the
// elements linked into those, and so on. One step back is one layer.

// Ids of the start element and everything up to `maxLayers` layers upstream of it
export function upstreamSet(links, startId, maxLayers = Infinity) {
  const visited = new Set([startId])
  let frontier = [startId]
  for (let layer = 0; layer < maxLayers && frontier.length; layer++) {
    const next = []
    for (const l of Object.values(links)) {
      if (frontier.includes(l.targetId) && !visited.has(l.sourceId)) {
        visited.add(l.sourceId)
        next.push(l.sourceId)
      }
    }
    frontier = next
  }
  return visited
}

// How many layers upstream actually exist for this element (0 = nothing links into it)
export function upstreamLayerCount(links, startId) {
  const visited = new Set([startId])
  let frontier = [startId]
  let layers = 0
  while (frontier.length) {
    const next = []
    for (const l of Object.values(links)) {
      if (frontier.includes(l.targetId) && !visited.has(l.sourceId)) {
        visited.add(l.sourceId)
        next.push(l.sourceId)
      }
    }
    if (next.length) layers++
    frontier = next
  }
  return layers
}

// Layers to walk for the current focus mode: all of them, or the chosen number
export const focusLayers = (s) => s.focusDeep ? Infinity : s.focusDepth
