// Where links cross each other. Links are drawn in the order they appear in `links`, so of two
// crossing links the later one is on top.

const END_CLEARANCE = 12  // ignore crossings this close to either link's ends (links meeting at an element)

function segmentCrossing(a1, a2, b1, b2) {
  const rx = a2.x - a1.x, ry = a2.y - a1.y
  const sx = b2.x - b1.x, sy = b2.y - b1.y
  const den = rx * sy - ry * sx
  if (den === 0) return null  // parallel: overlaps along a line aren't handled
  const qx = b1.x - a1.x, qy = b1.y - a1.y
  const t = (qx * sy - qy * sx) / den
  const u = (qx * ry - qy * rx) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  const la = Math.hypot(rx, ry), lb = Math.hypot(sx, sy)
  return { x: a1.x + rx * t, y: a1.y + ry * t, dirA: { x: rx / la, y: ry / la }, dirB: { x: sx / lb, y: sy / lb } }
}

// → { [linkId]: [{ otherId, above, x, y, selfDir, otherDir }] }
// above: the other link is on top of this one. Directions are unit vectors along each link at the crossing.
export function computeCrossings(links, paths) {
  const ids = Object.keys(links).filter(id => paths[id]?.length >= 2)
  const result = {}
  const add = (id, entry) => (result[id] ??= []).push(entry)
  const nearEnd = (pts, x, y) => {
    const first = pts[0], last = pts[pts.length - 1]
    return Math.hypot(x - first.x, y - first.y) < END_CLEARANCE || Math.hypot(x - last.x, y - last.y) < END_CLEARANCE
  }
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const below = paths[ids[i]], top = paths[ids[j]]
      for (let a = 0; a < below.length - 1; a++) {
        for (let b = 0; b < top.length - 1; b++) {
          const c = segmentCrossing(below[a], below[a + 1], top[b], top[b + 1])
          if (!c || nearEnd(below, c.x, c.y) || nearEnd(top, c.x, c.y)) continue
          add(ids[i], { otherId: ids[j], above: true,  x: c.x, y: c.y, selfDir: c.dirA, otherDir: c.dirB })
          add(ids[j], { otherId: ids[i], above: false, x: c.x, y: c.y, selfDir: c.dirB, otherDir: c.dirA })
        }
      }
    }
  }
  return result
}

// Where links cross the outline of an actor (a polygon): [{ linkId, x, y, selfDir, otherDir }].
// selfDir runs along the outline's edge, otherDir along the link, as in computeCrossings. Links are drawn on top of actors.
export function computeActorCrossings(verts, paths) {
  const out = []
  for (const [linkId, pts] of Object.entries(paths)) {
    if (!pts || pts.length < 2) continue
    const nearEnd = (x, y) => {
      const first = pts[0], last = pts[pts.length - 1]
      return Math.hypot(x - first.x, y - first.y) < END_CLEARANCE || Math.hypot(x - last.x, y - last.y) < END_CLEARANCE
    }
    for (let a = 0; a < pts.length - 1; a++) {
      for (let e = 0; e < verts.length; e++) {
        const c = segmentCrossing(verts[e], verts[(e + 1) % verts.length], pts[a], pts[a + 1])
        if (!c || nearEnd(c.x, c.y)) continue
        out.push({ linkId, x: c.x, y: c.y, selfDir: c.dirA, otherDir: c.dirB })
      }
    }
  }
  return out
}
