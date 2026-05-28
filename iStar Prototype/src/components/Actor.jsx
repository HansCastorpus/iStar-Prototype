import useStore from '../store/useStore.js'

const PADDING = 24

// Prototype: simple padded bounding box around member nodes.
// TODO: replace with octilinear convex hull algorithm.
function getBounds(actorId, nodes) {
  const members = Object.values(nodes).filter((n) => n.actorId === actorId)
  if (members.length === 0) return null

  const minX = Math.min(...members.map((n) => n.x))
  const minY = Math.min(...members.map((n) => n.y))
  const maxX = Math.max(...members.map((n) => n.x + n.width))
  const maxY = Math.max(...members.map((n) => n.y + n.height))

  return {
    x: minX - PADDING,
    y: minY - PADDING,
    width:  maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
  }
}

export default function Actor({ actor }) {
  const nodes = useStore((s) => s.nodes)
  const bounds = getBounds(actor.id, nodes)
  if (!bounds) return null

  return (
    <g>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill="none"
        stroke="#aaa"
        strokeWidth={1}
        strokeDasharray="6 3"
      />
      <text
        x={bounds.x + 4}
        y={bounds.y - 4}
        fontSize={10}
        fill="#aaa"
        style={{ userSelect: 'none' }}
      >
        {actor.name}
      </text>
    </g>
  )
}
