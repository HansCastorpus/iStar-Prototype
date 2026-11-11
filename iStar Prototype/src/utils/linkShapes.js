// Shared measurements for the arrowheads and end icons of links, on the graph and in the viewer popup.
export const ARROW_H  = 8   // triangle height
export const ARROW_HW = 5   // triangle half-base width
export const ICON_GAP = 4   // gap between triangle base and icon centre
export const ICON_R        = ARROW_HW   // default icon radius
export const LARGE_ICON_R  = 8          // larger icons for hurt/help/make/break
export const ICON_STUB     = 3
export const TRIM          = ARROW_H + ICON_GAP + ICON_R       * 2 - ICON_STUB
export const TRIM_LARGE    = ARROW_H + ICON_GAP + LARGE_ICON_R * 2 - ICON_STUB
export const TRIM_DOUBLE   = TRIM       + ICON_R       * 2 + 2
export const TRIM_DOUBLE_L = TRIM_LARGE + LARGE_ICON_R * 2 + 2
export const TRIM_NEEDED   = ARROW_H + ICON_GAP + ICON_R + ARROW_H / 2 - ICON_STUB  // inverse triangle

// Types that also have a source-end decoration (triangle + icon).
export const SOURCE_DECORATED = new Set(['depends-on'])

export function arrowPolygon({ tip, dx, dy }) {
  const bx = tip.x - dx * ARROW_H, by = tip.y - dy * ARROW_H
  return [
    `${tip.x},${tip.y}`,
    `${bx - dy * ARROW_HW},${by + dx * ARROW_HW}`,
    `${bx + dy * ARROW_HW},${by - dx * ARROW_HW}`,
  ].join(' ')
}

export function iconPos({ tip, dx, dy }, r = ICON_R) {
  const dist = ARROW_H + ICON_GAP + r
  return { x: tip.x - dx * dist, y: tip.y - dy * dist }
}
