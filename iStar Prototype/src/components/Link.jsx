import useStore from '../store/useStore.js'
import { pointsToPath, getMidSegment } from '../utils/routing.js'

export default function Link({ link, points }) {
  const { selectedId, select, deleteLink } = useStore()

  if (!points || points.length < 2) return null

  const d = pointsToPath(points)
  const { mid, angle } = getMidSegment(points)
  const isSelected = selectedId === link.id

  const handleClick = (e) => {
    e.stopPropagation()
    select(link.id, 'link')
  }

  const handleKeyDown = (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId === link.id) {
      deleteLink(link.id)
    }
  }

  return (
    <g onClick={handleClick} onKeyDown={handleKeyDown} tabIndex={0}
      style={{ outline: 'none' }}>
      {/* Wide invisible hit area */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={10}
        style={{ cursor: 'pointer' }} />

      {/* Visible path */}
      <path
        d={d}
        fill="none"
        stroke={isSelected ? '#0070f3' : '#555'}
        strokeWidth={isSelected ? 2 : 1.5}
        markerEnd="url(#arrow-default)"
      />

    </g>
  )
}
