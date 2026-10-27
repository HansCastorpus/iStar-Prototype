import useStore from '../store/useStore.js'
import { computePreviewPath, computePendingPath, pointsToPath } from '../utils/routing.js'

export default function LinkPreview({ cursorWorld }) {
  const { connectSource, pendingLink, nodes } = useStore()

  // Ghost link between the two clicked elements while the link type is being chosen
  if (pendingLink) {
    const src = nodes[pendingLink.sourceId], tgt = nodes[pendingLink.targetId]
    if (!src || !tgt) return null
    const points = computePendingPath(src, pendingLink.sourceSide, tgt, pendingLink.targetSide)
    return (
      <path
        d={pointsToPath(points)}
        fill="none"
        stroke="#16a34a"
        strokeWidth={1.5}
        strokeDasharray="6 3"
        opacity={0.8}
        style={{ pointerEvents: 'none' }}
      />
    )
  }

  if (!connectSource) return null

  const sourceNode = nodes[connectSource.nodeId]
  if (!sourceNode) return null

  const points = computePreviewPath(sourceNode, connectSource.side, cursorWorld)
  const d = pointsToPath(points)

  return (
    <path
      d={d}
      fill="none"
      stroke="#0070f3"
      strokeWidth={1.5}
      strokeDasharray="6 3"
      style={{ pointerEvents: 'none' }}
    />
  )
}
