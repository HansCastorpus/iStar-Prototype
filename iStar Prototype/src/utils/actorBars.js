// Keeping an actor's name clear of links. Links run over the actors, so one can pass straight through a name bar. The logo and
// name first slide along the bar to a spot no link touches; when there is none, the bar grows at one end (the side that
// needs the least) until there is, so no empty stretch is added on the other side. Links don't depend on the actors'
// shapes, so this settles: growing a nested actor can move its parent's bar, so the calculation repeats a few times.
import { actorLayout, octilinearHull, headerSize, asMeta, barSpan, HEADER_H, HEADER_CONTENT_H } from './actorTree.js'

const SLIDE_STEP = 12     // the content moves along the bar in steps of this much
const MARGIN = 6          // least space between the content and a link
const EDGE = 6            // and between the content and the end of the bar's straight part
const GROW_STEP = 12      // the bar grows by this much at one end at a time
const MAX_GROW = 400      // and by no more than this
const PASSES = 4
const CONTENT_H = HEADER_CONTENT_H

function segmentHitsRect(a, b, r) {
  let t0 = 0, t1 = 1
  const dx = b.x - a.x, dy = b.y - a.y
  for (const [p, q] of [[-dx, a.x - r.x1], [dx, r.x2 - a.x], [-dy, a.y - r.y1], [dy, r.y2 - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue }
    const k = q / p
    if (p < 0) { if (k > t1) return false; if (k > t0) t0 = k }
    else { if (k < t0) return false; if (k < t1) t1 = k }
  }
  return true
}

// Best spot for content `contentW` wide on a bar whose straight top edge runs lo..hi: the middle first, then alternately to
// either side. → { offset from the middle, hits: link segments touching it there }
function placeName(lo, hi, midY, contentW, paths) {
  const cx = (lo + hi) / 2
  const slack = Math.max(0, (hi - lo - contentW) / 2 - EDGE)
  const offsets = [0]
  for (let o = SLIDE_STEP; o <= slack; o += SLIDE_STEP) offsets.push(-o, o)
  let best = 0, bestHits = Infinity
  for (const o of offsets) {
    const box = { x1: cx + o - contentW / 2 - MARGIN, x2: cx + o + contentW / 2 + MARGIN,
      y1: midY - CONTENT_H / 2 - MARGIN, y2: midY + CONTENT_H / 2 + MARGIN }
    let hits = 0
    for (const path of paths) {
      for (let i = 1; i < path.length; i++) if (segmentHitsRect(path[i - 1], path[i], box)) hits++
    }
    if (hits < bestHits) { best = o; bestHits = hits }
    if (!hits) break
  }
  return { offset: best, hits: bestHits }
}

// → { extras: { actorId: { l, r } width added to the left / right end of its bar }, offsets: { actorId: how far the name sits from the middle } }
export function barLayout(nodes, names, linkPaths) {
  const paths = Object.values(linkPaths)
  const extras = {}
  let offsets = {}
  for (let pass = 0; pass < PASSES; pass++) {
    const L = actorLayout(nodes, names, extras)
    offsets = {}
    let grew = false
    for (const id of Object.keys(L.members)) {
      const verts = octilinearHull(L.points[id])
      if (verts.length < 3) continue
      const topY = Math.min(...verts.map(v => v.y))
      const { lo, hi } = barSpan(verts, topY)
      const meta = asMeta(names[id])
      const { contentW } = headerSize(meta.name, meta.logo)
      const midY = topY + HEADER_H / 2

      let spot = placeName(lo, hi, midY, contentW, paths)
      if (spot.hits && pass < PASSES - 1) {
        for (let grow = GROW_STEP; grow <= MAX_GROW; grow += GROW_STEP) {
          // either end; the left one on a tie
          const toLeft = placeName(lo - grow, hi, midY, contentW, paths)
          const toRight = toLeft.hits ? placeName(lo, hi + grow, midY, contentW, paths) : null
          const side = !toLeft.hits ? 'l' : !toRight.hits ? 'r' : null
          if (!side) continue
          extras[id] = { l: extras[id]?.l ?? 0, r: extras[id]?.r ?? 0 }
          extras[id][side] += grow
          grew = true
          spot = side === 'l' ? toLeft : toRight
          break
        }
      }
      offsets[id] = spot.offset
    }
    if (!grew) break
  }
  return { extras, offsets }
}
