import useStore from '../store/useStore.js'
import { computePreviewPath, pointsToPath } from '../utils/routing.js'

export default function LinkPreview({ cursorWorld }) {
  const { connectSource, nodes } = useStore()
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
