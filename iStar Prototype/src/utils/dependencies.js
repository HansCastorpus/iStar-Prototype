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

// Everything on a directed path between two elements, in either direction: the elements, and the
// links that lie on some path. → { nodes: Set, links: Set } or null when neither reaches the other.
export function pathBetween(links, aId, bId) {
  const all = Object.values(links)
  const reach = (startId, forward) => {
    const seen = new Set([startId])
    for (let frontier = [startId]; frontier.length;) {
      const next = []
      for (const l of all) {
        const from = forward ? l.sourceId : l.targetId, to = forward ? l.targetId : l.sourceId
        if (frontier.includes(from) && !seen.has(to)) { seen.add(to); next.push(to) }
      }
      frontier = next
    }
    return seen
  }
  const nodes = new Set(), onPath = new Set()
  for (const [from, to] of [[aId, bId], [bId, aId]]) {
    const afterFrom = reach(from, true), beforeTo = reach(to, false)
    if (!afterFrom.has(to)) continue  // no path this way
    for (const l of all) {
      if (afterFrom.has(l.sourceId) && beforeTo.has(l.targetId)) {
        onPath.add(l.id); nodes.add(l.sourceId); nodes.add(l.targetId)
      }
    }
  }
  return onPath.size ? { nodes, links: onPath } : null
}

// What the diagram highlights right now, or null for nothing (everything drawn normally):
//  - path button on with two elements selected: the path between them (nothing at all if there is none)
//  - otherwise the dependency view of the focused element
// → { nodes: Set, links: Set, ends: Set } where `ends` are the elements the view starts from.
// Cached, so selectors that call it get the same object back until something it depends on changes.
let cache = { key: [], view: null }
export function focusView(s) {
  const key = [s.links, s.pathOn, s.selectedIds, s.selectedActorId, s.focusNodeId, s.focusDeep, s.focusDepth]
  if (cache.key.length === key.length && cache.key.every((v, i) => v === key[i])) return cache.view
  let view = null
  if (s.pathOn && s.selectedIds.length === 2 && !s.selectedActorId) {  // (an actor with two elements is not a pair)
    const [a, b] = s.selectedIds
    const path = pathBetween(s.links, a, b)
    if (path) view = { ...path, ends: new Set([a, b]) }
  } else if (s.focusNodeId) {
    const nodes = upstreamSet(s.links, s.focusNodeId, focusLayers(s))
    const ls = new Set(Object.values(s.links).filter(l => nodes.has(l.sourceId) && nodes.has(l.targetId)).map(l => l.id))
    view = { nodes, links: ls, ends: new Set([s.focusNodeId]) }
  }
  cache = { key, view }
  return view
}
