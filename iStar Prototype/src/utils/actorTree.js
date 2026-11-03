// Actor nesting. An element belongs to a chain of actors: its primary actor (`actorId`) and then its
// nested actors (`nestedActorIds`), each inside the one before. An actor's area is the hull of every
// element whose chain contains it, so a parent's area always has its nested actors' areas inside it.
// Shared by the actor drawing (Actor.jsx) and the overlap checks in the store.

export const PAD = 20        // space between an actor's edge and what is directly inside it
export const TAG_ROOM = 55   // room above a nested actor, inside its parent, for its name tag and connector line
export const LINE_LEN = 15       // connector line from an actor's edge to its name tag
export const LABEL_PAD_X = 10
export const LABEL_PAD_Y = 6
const FONT_SIZE_PRIMARY = 18     // name tag text size of a primary actor
const FONT_SIZE_NESTED = 18       // ... and of a nested actor
const FONT_SIZE_HL_BUMP = 1.5     // added when the actor is highlighted
export const tagFontSize = (nested, highlighted) =>
  (nested ? FONT_SIZE_NESTED : FONT_SIZE_PRIMARY) + (highlighted ? FONT_SIZE_HL_BUMP : 0)
const TAG_MARGIN = 8              // space kept around a nested actor's tag
export const ACTOR_GAP = 20  // required clearance between unrelated actor areas

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

// Height of a name tag: the text, or a taller logo (which then gets a little padding of its own)
export function tagHeight(fontSize, logo) {
  const own = fontSize + 2 * LABEL_PAD_Y
  return logo ? Math.max(own, logoSize(fontSize, logo).h + 8) : own
}

// Width of a name tag: the text, plus the logo (if any) to the right of it. `logo` is the aspect ratio.
export const LOGO_GAP = 6
export function tagTextSize(name, fontSize, bold, logo) {
  const textW = measureText(name, `${bold ? 'bold' : 'normal'} ${fontSize}px sans-serif`)
  const logoW = logo ? logoSize(fontSize, logo).w : 0
  const contentW = textW + (logo ? LOGO_GAP + logoW : 0)
  return { textW, contentW, logoW, labelW: Math.max(36, contentW + 2 * LABEL_PAD_X) }
}

// Where the tag of a nested actor hangs from: the middle of the top edge of its outline
export function topCenterOf(verts) {
  const topY = Math.min(...verts.map(v => v.y))
  const xs = verts.filter(v => v.y - topY < 0.5).map(v => v.x)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: topY }
}

// Space a nested actor's tag takes above its top edge (sized for the highlighted, bold text so that
// highlighting never makes it collide with anything)
function tagRect({ name, logo }, topCenter) {
  const fontSize = tagFontSize(true, true)
  const { labelW: w } = tagTextSize(name, fontSize, true, logo)
  const h = tagHeight(fontSize, logo)
  return { x1: topCenter.x - w / 2, x2: topCenter.x + w / 2, y1: topCenter.y - LINE_LEN - h, y2: topCenter.y }
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

// id -> name for the actors store, which the layout needs to size name tags
// (a value can also be just a name string, for an actor that doesn't exist yet)
export const actorNames = (actors) =>
  Object.fromEntries(Object.entries(actors).map(([id, a]) => [id, { name: a.name, logo: a.logo ? a.logoAspect ?? 1 : 0 }]))
const asMeta = (m) => (typeof m === 'string' ? { name: m } : m ?? { name: '' })

// members / parentOf / outline points per actor. `invalid` is set when an actor would sit in two
// different places (two parents, or inside itself); such a state is never allowed to be created.
//
// An actor's area keeps the same distance (PAD) from everything directly inside it: its own elements
// and the areas of its nested actors. Above each nested actor there is TAG_ROOM instead, for its tag.
export function actorLayout(nodes, names = {}) {
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

  // Corner points of the area, built from the inside out; tags[id] is the room a nested actor's tag needs
  const points = {}, tags = {}
  const pointsOf = (id, depth = 0) => {
    if (points[id]) return points[id]
    const pts = (direct[id] ?? []).flatMap(n => [
      { x: n.x - PAD, y: n.y - PAD },
      { x: n.x + n.width + PAD, y: n.y - PAD },
      { x: n.x - PAD, y: n.y + n.height + PAD },
      { x: n.x + n.width + PAD, y: n.y + n.height + PAD },
    ])
    if (depth < 50) for (const c of children[id] ?? []) {
      const verts = octilinearHull(pointsOf(c, depth + 1))
      if (verts.length) {
        const r = (tags[c] = tagRect(asMeta(names[c]), topCenterOf(verts)))
        // the area also holds the tag, with a little space around it
        pts.push({ x: r.x1 - TAG_MARGIN, y: r.y1 - TAG_MARGIN }, { x: r.x2 + TAG_MARGIN, y: r.y1 - TAG_MARGIN })
      }
      for (const v of verts) {
        pts.push(
          { x: v.x - PAD, y: v.y - TAG_ROOM }, { x: v.x + PAD, y: v.y - TAG_ROOM },
          { x: v.x - PAD, y: v.y + PAD },      { x: v.x + PAD, y: v.y + PAD },
        )
      }
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

  return { members, parentOf, points, tags, shade, invalid }
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
//    (or the name tag above it)
//  - a nested actor's name tag touches an element, or another nested actor's tag
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
    const area = extentsOf(L.points[id].flatMap(p => [p, { x: p.x, y: p.y - TAG_ROOM }]))  // the actor's area plus the tag above it
    for (const n of siblings) {
      if (memberIds.has(n.id)) continue
      const r = extentsOf([{ x: n.x, y: n.y }, { x: n.x + n.width, y: n.y }, { x: n.x, y: n.y + n.height }, { x: n.x + n.width, y: n.y + n.height }])
      if (!hullsSeparated(r, area, 0)) keys.add(`n:${id}|${n.id}`)
    }
  }

  const hits = (a, b, m) => a.x1 - m < b.x2 && b.x1 - m < a.x2 && a.y1 - m < b.y2 && b.y1 - m < a.y2
  const tagIds = Object.keys(L.tags)
  for (const id of tagIds) {
    const memberIds = new Set(L.members[id].map(n => n.id))
    for (const n of Object.values(nodes)) {
      if (memberIds.has(n.id)) continue
      const r = { x1: n.x, x2: n.x + n.width, y1: n.y, y2: n.y + n.height }
      if (hits(L.tags[id], r, TAG_MARGIN / 2)) keys.add(`t:${id}|${n.id}`)
    }
  }
  for (let i = 0; i < tagIds.length; i++) {
    for (let j = i + 1; j < tagIds.length; j++) {
      if (hits(L.tags[tagIds[i]], L.tags[tagIds[j]], TAG_MARGIN / 2)) keys.add(`tt:${tagIds[i]}|${tagIds[j]}`)
    }
  }
  return { invalid: L.invalid, keys }
}

// True if going from `before` to `after` creates a problem that wasn't already there
export const addsIssue = (before, after) => [...after.keys].some(k => !before.keys.has(k))
