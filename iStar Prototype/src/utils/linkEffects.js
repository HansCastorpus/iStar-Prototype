import { focusView } from './dependencies.js'
import { HIGHLIGHT_STYLES } from './linkStyles.js'

// How a link looks where it passes over something else (another link, or the outline of an actor): the thing underneath
// breaks off to let a plain link through; when the link is highlighted it casts a shadow onto it instead.
export const GAP = 5             // clear space either side of a top link that is not highlighted (at a right-angle crossing)
export const DIAGONAL_GAP = 4    // extra clear space when the two cross at a shallow angle, so they stay readable
export const SHADOW_REACH = 14   // how far along the top link its shadow extends from the crossing
export const SHADOW_LAYERS = [{ grow: 12, opacity: 0.05 }, { grow: 9, opacity: 0.07 }, { grow: 6, opacity: 0.1 }, { grow: 3, opacity: 0.14 }]
export const BASE_SW = 1.5
export const SELECTED_SW = 2

// How square-on a crossing is: 1 = perpendicular, → 0 = running nearly alongside each other
export const squareness = (c) => Math.max(0.3, Math.abs(c.selfDir.x * c.otherDir.y - c.selfDir.y * c.otherDir.x))
// A short line through the crossing along a direction (used for the gap cut and the shadow)
export const segment = (c, dir, reach) =>
  `M${c.x - dir.x * reach},${c.y - dir.y * reach} L${c.x + dir.x * reach},${c.y + dir.y * reach}`

// What each of the given links looks like right now, as a string that only changes when a look does:
// 'h' hidden, 'n<width>' plain, 'a<width>' highlighted
export function linkLooks(s, ids) {
  if (!ids.length) return ''
  const view = focusView(s)
  return ids.map(id => {
    const o = s.links[id]
    if (!o || !s.isolateTypes.includes(o.type)) return `${id}:h`
    const active = (s.highlightTypes.length > 0 && s.highlightTypes.includes(o.type)) || !!view?.links.has(id)
    const sw = active ? HIGHLIGHT_STYLES[o.type]?.sw ?? BASE_SW : s.selectedId === id ? SELECTED_SW : BASE_SW
    return `${id}:${active ? 'a' : 'n'}${sw}`
  }).join('|')
}
export const parseLooks = (str) => Object.fromEntries(str.split('|').filter(Boolean).map(e => {
  const [id, v] = e.split(':')
  return [id, { hidden: v === 'h', active: v[0] === 'a', sw: parseFloat(v.slice(1)) }]
}))
