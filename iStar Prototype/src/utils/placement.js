// Picks a screen position for a popup next to an anchor rect so that it covers
// as little of the diagram as possible. All rects are { x, y, w, h } in screen px.

const ANCHOR_WEIGHT = 20   // covering the selected element itself is the worst outcome
const DIST_WEIGHT   = 2    // px² of overlap we'd trade for 1px of extra distance
const RINGS         = [16, 48, 96, 160, 240]  // gaps tried between anchor and popup

export function rectOverlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

export const inflate = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d })

// obstacles: [{ x, y, w, h, weight }]
export function placePopup({ anchor, size, obstacles, viewport, margin = 8 }) {
  const { w, h } = size
  const ax1 = anchor.x, ay1 = anchor.y
  const ax2 = anchor.x + anchor.w, ay2 = anchor.y + anchor.h
  const acx = ax1 + anchor.w / 2, acy = ay1 + anchor.h / 2

  // Candidates in order of preference (ties keep the earlier one)
  const candidates = []
  for (const g of RINGS) {
    for (const y of [ay1 - g - h, ay2 + g])
      for (const x of [ax1 - g - w, ax2 + g]) candidates.push({ x, y })        // diagonals
    for (const y of [ay1 - g - h, ay2 + g])
      for (const x of [acx - w / 2, ax1, ax2 - w]) candidates.push({ x, y })   // above / below
    for (const x of [ax2 + g, ax1 - g - w])
      for (const y of [acy - h / 2, ay1, ay2 - h]) candidates.push({ x, y })   // right / left
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)))
  const guard = inflate(anchor, 6)

  let best = null
  for (const c of candidates) {
    const x = clamp(c.x, margin, viewport.w - w - margin)
    const y = clamp(c.y, margin, viewport.h - h - margin)
    const box = { x, y, w, h }

    let cost = rectOverlap(box, guard) * ANCHOR_WEIGHT
    for (const o of obstacles) cost += rectOverlap(box, o) * o.weight
    cost += Math.hypot(x + w / 2 - acx, y + h / 2 - acy) * DIST_WEIGHT

    if (!best || cost < best.cost) best = { x, y, cost }
  }
  return { x: best.x, y: best.y }
}

// Closest points between two rects, for drawing a connector from popup to anchor
export function connectorPoints(popup, anchor) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi))
  const a = {
    x: clamp(popup.x + popup.w / 2, anchor.x, anchor.x + anchor.w),
    y: clamp(popup.y + popup.h / 2, anchor.y, anchor.y + anchor.h),
  }
  const p = {
    x: clamp(a.x, popup.x, popup.x + popup.w),
    y: clamp(a.y, popup.y, popup.y + popup.h),
  }
  return { p, a }
}
