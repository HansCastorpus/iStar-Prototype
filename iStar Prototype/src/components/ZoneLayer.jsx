import { useMemo } from 'react'
import useStore from '../store/useStore.js'
import { octilinearHull } from '../utils/actorTree.js'

// Risk zones: for each zone, a blurred red area around the elements that carry it, so the elements read as one marked group
// from a distance. Zones can overlap each other and actors (where they overlap, the red builds up). Drawn above the actors
// and below the links and elements, so nothing is covered. A zone switched off in the left panel is not drawn.
export const ZONE_RED = '#e11d48'
const REACH = 30     // how far the area extends beyond the elements it surrounds
const BLUR = 24      // how soft its edge is
const FILL = 0.16

// The middle of the area (its centre of gravity, which is always inside it), where the name goes
function centroid(poly) {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    const cross = p.x * q.y - q.x * p.y
    a += cross; cx += (p.x + q.x) * cross; cy += (p.y + q.y) * cross
  }
  if (Math.abs(a) < 1e-6) return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}

export default function ZoneLayer() {
  const zones = useStore(s => s.zones)
  const nodes = useStore(s => s.nodes)
  const hidden = useStore(s => s.hiddenZoneIds)

  const shapes = useMemo(() => {
    const out = []
    for (const zone of Object.values(zones)) {
      const corners = []
      for (const n of Object.values(nodes)) {
        if (!n.zoneIds?.includes(zone.id)) continue
        const x1 = n.x - REACH, y1 = n.y - REACH, x2 = n.x + n.width + REACH, y2 = n.y + n.height + REACH
        corners.push({ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x1, y: y2 }, { x: x2, y: y2 })
      }
      if (!corners.length) continue
      const hull = octilinearHull(corners)
      if (hull.length < 3) continue
      out.push({
        id: zone.id, name: zone.name,
        d: `M${hull.map(p => `${p.x},${p.y}`).join(' L')} Z`,
        label: centroid(hull),
      })
    }
    return out
  }, [zones, nodes])

  const shown = shapes.filter(z => !hidden.includes(z.id))
  if (!shown.length) return null
  return (
    <g style={{ pointerEvents: 'none' }}>
      <defs>
        <filter id="zone-blur" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={BLUR} />
        </filter>
      </defs>
      {shown.map(z => (
        // the stroke rounds the corners of the area; the blur then softens the whole of it
        <path key={z.id} d={z.d} fill={ZONE_RED} fillOpacity={FILL} stroke={ZONE_RED} strokeOpacity={FILL} strokeWidth={REACH / 1.5}
          strokeLinejoin="round" filter="url(#zone-blur)" />
      ))}
      {shown.map(z => (
        <text key={`t-${z.id}`} x={z.label.x} y={z.label.y} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold" fontFamily="Roboto, sans-serif"
          fill="#9f1239" stroke="var(--bg-canvas)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">{z.name}</text>
      ))}
    </g>
  )
}
