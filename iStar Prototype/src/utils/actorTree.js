// Actor nesting. An element belongs to a chain of actors: its primary actor (`actorId`) and then its
// nested actors (`nestedActorIds`), each inside the one before. An actor's area is the hull of every
// element whose chain contains it, so a parent's area always has its nested actors' areas inside it.
// Shared by the actor drawing (Actor.jsx) and the overlap checks in the store.

export const PAD = 20        // space between an actor's edge and what is directly inside it
// The actor's name sits in a bar that is part of the top of its area: the area grows upward by HEADER_H, and wide enough
// for the name and logo.
export const HEADER_H = 56        // height of the name bar
export const HEADER_FONT = 28     // text size of the name
export const HEADER_LOGO = 40     // the logo's shorter side
export const HEADER_GAP = 10      // between the logo and the name
const HEADER_PAD_X = 22           // room left and right of the logo + name
export const ACTOR_GAP = 20  // required clearance between unrelated actor areas

// Each actor gets one of ACTOR_TINTS colours (--actor-tint-N in index.css), kept on the actor as `colorIdx`;
// actors from before that existed take the colour of their position in the list
export const ACTOR_TINTS = 12
export const actorTintIndex = (actors, id) => {
  const a = actors[id]
  return (a?.colorIdx ?? Math.max(0, Object.keys(actors).indexOf(id))) % ACTOR_TINTS
}
export const actorTintVar = (actors, id) => `var(--actor-tint-${actorTintIndex(actors, id)})`
// The colour not yet used (or least used) by the existing actors
export function nextTintIndex(actors) {
  const counts = Array(ACTOR_TINTS).fill(0)
  Object.keys(actors).forEach(id => counts[actorTintIndex(actors, id)]++)
  return counts.indexOf(Math.min(...counts))
}

// The actors an element belongs to, outermost first (empty if it has no primary actor)
export function chainOf(node) {
  if (!node.actorId) return []
  return [node.actorId, ...(node.nestedActorIds ?? [])].filter(Boolean)
}

export const inActor = (node, actorId) => chainOf(node).includes(actorId)

let measureCtx = null
export function measureText(text, font) {
  if (typeof document === 'undefined') return text.length * 7  // no canvas (tests): rough width
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

// Size of a logo (aspect = width / height) next to the text of a tag: the shorter side is the text
// height, so a wide logo is as tall as the text and a tall one as wide as it. Held to 8x the text
// height on the long side.
export function logoSize(fontSize, aspect) {
  if (aspect >= 1) return { w: Math.min(fontSize * aspect, fontSize * 8), h: fontSize }
  const h = Math.min(fontSize / aspect, fontSize * 8)
  return { w: h * aspect, h }
}

// Where the logo and name can sit across the name bar: the horizontal stretch that is inside the outline over the whole height
// of the content (so slanted corners never cut it). Its middle is where the content is centred.
export const HEADER_CONTENT_H = Math.max(HEADER_FONT, HEADER_LOGO)
export function barSpan(verts, topY) {
  const crossings = (y) => {
    const xs = []
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length]
      if ((a.y <= y && y < b.y) || (b.y <= y && y < a.y)) xs.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y))
    }
    return xs
  }
  const mid = topY + HEADER_H / 2
  const upper = crossings(mid - HEADER_CONTENT_H / 2), lower = crossings(mid + HEADER_CONTENT_H / 2)
  const lo = Math.max(Math.min(...upper), Math.min(...lower)), hi = Math.min(Math.max(...upper), Math.max(...lower))
  return hi > lo ? { lo, hi } : { lo: Math.min(...upper, ...lower), hi: Math.max(...upper, ...lower) }
}

// What the name bar holds (logo on the left, then the name) and the least width the area's top edge needs for it
export function headerSize(name, logo) {
  const textW = measureText(name || '', `bold ${HEADER_FONT}px sans-serif`)
  const logoW = logo ? logoSize(HEADER_LOGO, logo).w : 0
  const contentW = textW + (logo ? HEADER_GAP + logoW : 0)
  return { textW, logoW, contentW, minW: contentW + 2 * HEADER_PAD_X }
}

// Octagon (as vertices) around a set of points, with edges along the axes and diagonals
export function octilinearHull(points) {
  if (!points.length) return []

  let a = -Infinity, b = -Infinity, c = -Infinity, d = -Infinity
  let e = -Infinity, f = -Infinity, g = -Infinity, h = -Infinity

  for (const { x, y } of points) {
    if (x > a) a = x
    if (x + y > b) b = x + y
    if (y > c) c = y
    if (-x + y > d) d = -x + y
    if (-x > e) e = -x
    if (-x - y > f) f = -x - y
    if (-y > g) g = -y
    if (x - y > h) h = x - y
  }

  const raw = [
    { x: a, y: b - a },
    { x: b - c, y: c },
    { x: c - d, y: c },
    { x: -e, y: d - e },
    { x: -e, y: e - f },
    { x: g - f, y: -g },
    { x: h - g, y: -g },
    { x: a, y: a - h },
  ]

  const eps = 0.01
  const verts = []
  for (const v of raw) {
    const prev = verts[verts.length - 1]
    if (!prev || Math.abs(v.x - prev.x) > eps || Math.abs(v.y - prev.y) > eps)
      verts.push(v)
  }
  const last = verts[verts.length - 1], first = verts[0]
  if (verts.length > 1 &&
    Math.abs(last.x - first.x) < eps &&
    Math.abs(last.y - first.y) < eps)
    verts.pop()

  return verts
}

// The actors whose area contains the point, outermost first (so [primary, ...nested]): where an element dropped
// there would belong. Empty when the point is outside every actor.
export function actorChainAt(nodes, x, y, names = {}) {
  const { points, parentOf } = actorLayout(nodes, names)
  const inside = (verts) => {
    let hit = false
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const a = verts[i], b = verts[j]
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit
    }
    return hit
  }
  const hits = Object.keys(points).filter(id => inside(octilinearHull(points[id])))
  const depthOf = (id) => { let d = 0; for (let p = parentOf[id]; p && d < 50; p = parentOf[p]) d++; return d }
  const deepest = hits.sort((a, b) => depthOf(b) - depthOf(a))[0]
  const chain = []
  for (let id = deepest; id && chain.length < 50; id = parentOf[id]) chain.unshift(id)
  return chain
}

// id -> name for the actors store, which the layout needs to size name tags
// (a value can also be just a name string, for an actor that doesn't exist yet)
export const actorNames = (actors) =>
  Object.fromEntries(Object.entries(actors).map(([id, a]) => [id, { name: a.name, logo: a.logo ? a.logoAspect ?? 1 : 0 }]))
export const asMeta = (m) => (typeof m === 'string' ? { name: m } : m ?? { name: '' })

// members / parentOf / outline points per actor. `invalid` is set when an actor would sit in two
// different places (two parents, or inside itself); such a state is never allowed to be created.
//
// An actor's area keeps the same distance (PAD) from everything directly inside it: its own elements
// and the areas of its nested actors. On top of that comes the name bar (HEADER_H), part of the area itself.
// extras: { actorId: { l, r } } width added to the left / right end of that actor's name bar (see actorBars.js)
export function actorLayout(nodes, names = {}, extras = {}) {
  const members = {}, direct = {}, parentOf = {}, children = {}
  let invalid = false
  for (const n of Object.values(nodes)) {
    const chain = chainOf(n)
    if (new Set(chain).size !== chain.length) invalid = true
    chain.forEach((id, i) => {
      ;(members[id] ??= []).push(n)
      const p = i ? chain[i - 1] : null
      if (id in parentOf && parentOf[id] !== p) invalid = true
      else parentOf[id] = p
      if (p) (children[p] ??= new Set()).add(id)
    })
    if (chain.length) (direct[chain[chain.length - 1]] ??= []).push(n)
  }

  // Corner points of the area, built from the inside out
  const points = {}
  const pointsOf = (id, depth = 0) => {
    if (points[id]) return points[id]
    const pts = (direct[id] ?? []).flatMap(n => [
      { x: n.x - PAD, y: n.y - PAD },
      { x: n.x + n.width + PAD, y: n.y - PAD },
      { x: n.x - PAD, y: n.y + n.height + PAD },
      { x: n.x + n.width + PAD, y: n.y + n.height + PAD },
    ])
    if (depth < 50) for (const c of children[id] ?? []) {
      // a nested actor's area already includes its own name bar
      for (const v of octilinearHull(pointsOf(c, depth + 1))) {
        pts.push(
          { x: v.x - PAD, y: v.y - PAD }, { x: v.x + PAD, y: v.y - PAD },
          { x: v.x - PAD, y: v.y + PAD }, { x: v.x + PAD, y: v.y + PAD },
        )
      }
    }
    if (pts.length) {
      // The name bar: HEADER_H above the top edge, as wide as that edge or as the name needs, with straight sides
      const top = Math.min(...pts.map(p => p.y))
      const edge = pts.filter(p => p.y - top < 0.5).map(p => p.x)
      const mid = (Math.min(...edge) + Math.max(...edge)) / 2
      const meta = asMeta(names[id])
      const half = Math.max((Math.max(...edge) - Math.min(...edge)) / 2, headerSize(meta.name, meta.logo).minW / 2)
      const left = mid - half - (extras[id]?.l ?? 0), right = mid + half + (extras[id]?.r ?? 0)
      pts.push(
        { x: left, y: top - HEADER_H },  { x: right, y: top - HEADER_H },
        { x: left, y: top },             { x: right, y: top },
      )
    }
    return (points[id] = pts)
  }
  for (const id of Object.keys(members)) pointsOf(id)

  // Depth in the nesting (0 = primary) and how deep the whole tree goes, which set the background shade
  const depth = {}, rootOf = {}, treeDepth = {}
  for (const id of Object.keys(members)) {
    let d = 0, top = id
    for (let p = parentOf[id]; p && d < 50; p = parentOf[p]) { d++; top = p }
    depth[id] = d
    rootOf[id] = top
    treeDepth[top] = Math.max(treeDepth[top] ?? 0, d)
  }
  const shade = Object.fromEntries(Object.keys(members).map(id => [id, { depth: depth[id], levels: treeDepth[rootOf[id]] }]))

  return { members, parentOf, points, shade, invalid }
}

// Octilinear extent values (the 8 support values) of a set of points
export function extentsOf(points) {
  let a = -Infinity, b = -Infinity, c = -Infinity, d = -Infinity
  let e = -Infinity, f = -Infinity, g = -Infinity, h = -Infinity
  for (const { x, y } of points) {
    if (x > a) a = x
    if (x + y > b) b = x + y
    if (y > c) c = y
    if (-x + y > d) d = -x + y
    if (-x > e) e = -x
    if (-x - y > f) f = -x - y
    if (-y > g) g = -y
    if (x - y > h) h = x - y
  }
  return { a, b, c, d, e, f, g, h }
}

// SAT check for two octilinear hulls: true if they are separated by at least `gap` pixels
// along any of the 4 octilinear axis directions.
export function hullsSeparated(e1, e2, gap) {
  return (
    e1.a + e2.e + gap <= 0 || e2.a + e1.e + gap <= 0 ||
    e1.c + e2.g + gap <= 0 || e2.c + e1.g + gap <= 0 ||
    e1.b + e2.f + gap <= 0 || e2.b + e1.f + gap <= 0 ||
    e1.d + e2.h + gap <= 0 || e2.d + e1.h + gap <= 0
  )
}

// Elements that touch an actor's area without being part of that actor: { elementId: [actorId, …] }
export function strayElements(nodes, names = {}) {
  const L = actorLayout(nodes, names)
  const out = {}
  for (const [id, pts] of Object.entries(L.points)) {
    if (!pts.length) continue
    const area = extentsOf(pts)
    const memberIds = new Set(L.members[id].map(n => n.id))
    for (const n of Object.values(nodes)) {
      if (memberIds.has(n.id)) continue
      const r = extentsOf([{ x: n.x, y: n.y }, { x: n.x + n.width, y: n.y }, { x: n.x, y: n.y + n.height }, { x: n.x + n.width, y: n.y + n.height }])
      if (!hullsSeparated(r, area, 0)) (out[n.id] ??= []).push(id)
    }
  }
  return out
}

// Everything wrong with the current arrangement, as a set of keys (so a change can be judged by
// whether it adds a problem, rather than by whether any problem exists):
//  - two actors that aren't nested in each other have areas closer than ACTOR_GAP
//  - an element of the parent actor, but not of the nested one, runs into the nested actor's area
//    (name bar included)
export function layoutIssues(nodes, names = {}) {
  const L = actorLayout(nodes, names)
  const keys = new Set()
  const ids = Object.keys(L.members)
  const ext = Object.fromEntries(ids.map(id => [id, extentsOf(L.points[id])]))

  const isAncestor = (a, b) => {
    for (let p = L.parentOf[b], i = 0; p && i < 50; p = L.parentOf[p], i++) if (p === a) return true
    return false
  }
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j]
      if (isAncestor(a, b) || isAncestor(b, a)) continue
      if (!hullsSeparated(ext[a], ext[b], ACTOR_GAP)) keys.add(`h:${a}|${b}`)
    }
  }
  for (const id of ids) {
    if (!L.parentOf[id]) continue
    const memberIds = new Set(L.members[id].map(n => n.id))
    const siblings = L.members[L.parentOf[id]]  // only elements inside the parent can be in the way
    const area = extentsOf(L.points[id])
    for (const n of siblings) {
      if (memberIds.has(n.id)) continue
      const r = extentsOf([{ x: n.x, y: n.y }, { x: n.x + n.width, y: n.y }, { x: n.x, y: n.y + n.height }, { x: n.x + n.width, y: n.y + n.height }])
      if (!hullsSeparated(r, area, 0)) keys.add(`n:${id}|${n.id}`)
    }
  }

  return { invalid: L.invalid, keys }
}

// True if going from `before` to `after` creates a problem that wasn't already there
export const addsIssue = (before, after) => [...after.keys].some(k => !before.keys.has(k))
