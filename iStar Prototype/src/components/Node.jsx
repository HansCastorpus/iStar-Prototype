import { useRef } from 'react'
import useStore from '../store/useStore.js'
import { wrapLabel, NODE_LINE_H, NODE_BADGE_H, NODE_PAD_X, GOAL_PAD_X } from '../utils/grid.js'

const BADGE_CHAR_W = 7.5
const BADGE_PAD_X = 7

const NODE_TYPES = {
  goal: { stroke: '#333' },
  task: { stroke: '#333' },
  softgoal: { stroke: '#333' },
  resource: { stroke: '#333' },
}

// Pick the best source/target sides based on which axis has the larger separation.
function computeBestPorts(src, tgt) {
  const dx = (tgt.x + tgt.width / 2) - (src.x + src.width / 2)
  const dy = (tgt.y + tgt.height / 2) - (src.y + src.height / 2)
  if (Math.abs(dx) >= Math.abs(dy))
    return dx >= 0 ? { srcSide: 'right', tgtSide: 'left' } : { srcSide: 'left', tgtSide: 'right' }
  return dy >= 0 ? { srcSide: 'bottom', tgtSide: 'top' } : { srcSide: 'top', tgtSide: 'bottom' }
}

export default function Node({ node }) {
  const gRef = useRef(null)
  const nodeRef = useRef(node)
  nodeRef.current = node

  const pointerRef = useRef(null)

  const { mode, selectedId, select, moveNode, moveNodeGroup,
    addToSelection, setPendingLink, setDraggingNode } = useStore()

  const isSelected = useStore(s => s.selectedId === node.id || s.selectedIds.includes(node.id))
  const highlightTypes = useStore(s => s.highlightTypes)
  const isolateTypes = useStore(s => s.isolateTypes)

  const highlightActive = highlightTypes.length > 0
  const isHidden       = !isolateTypes.includes(node.type)
  const isHighlighted  = highlightActive && highlightTypes.includes(node.type)

  const HIGHLIGHT_FILLS = { goal: '#d0cabf', task: '#A2BBD9', softgoal: '#e2dfd5', resource: '#AFD2AF' }
  const hlFill = isHighlighted ? (HIGHLIGHT_FILLS[node.type] ?? 'white') : 'white'

  const clientToWorld = (cx, cy) => {
    const pt = gRef.current.ownerSVGElement.createSVGPoint()
    pt.x = cx; pt.y = cy
    return pt.matrixTransform(gRef.current.parentNode.getScreenCTM().inverse())
  }

  const onPointerDown = (e) => {
    if (useStore.getState().mode.startsWith('add-')) return
    if (e.button !== 0) return

    e.stopPropagation()

    if (e.shiftKey) {
      addToSelection(nodeRef.current.id)
      return
    }

    gRef.current.setPointerCapture(e.pointerId)

    const startWorld = clientToWorld(e.clientX, e.clientY)
    const { selectedIds } = useStore.getState()
    const groupIds = selectedIds.length > 1 && selectedIds.includes(nodeRef.current.id)
      ? selectedIds
      : null

    pointerRef.current = {
      pointerId: e.pointerId,
      startWorld,
      startNode: { x: nodeRef.current.x, y: nodeRef.current.y },
      groupIds,
      hasMoved: false,
    }
    setDraggingNode(nodeRef.current.id)
  }

  const onPointerMove = (e) => {
    const ps = pointerRef.current
    if (!ps || e.pointerId !== ps.pointerId) return

    const world = clientToWorld(e.clientX, e.clientY)
    const newX = ps.startNode.x + (world.x - ps.startWorld.x)
    const newY = ps.startNode.y + (world.y - ps.startWorld.y)

    if (!ps.hasMoved &&
      (Math.abs(newX - ps.startNode.x) > 1 || Math.abs(newY - ps.startNode.y) > 1))
      ps.hasMoved = true

    if (ps.groupIds) {
      moveNodeGroup(nodeRef.current.id, newX, newY, ps.groupIds)
    } else {
      moveNode(nodeRef.current.id, newX, newY)
    }
  }

  const endDrag = (e) => {
    const ps = pointerRef.current
    if (!ps || e.pointerId !== ps.pointerId) return

    gRef.current.releasePointerCapture(e.pointerId)
    setDraggingNode(null)

    if (!ps.hasMoved) {
      const state = useStore.getState()
      const prevSelected = state.selectedId

      // If another single node was already selected, start a link between them.
      if (
        prevSelected &&
        prevSelected !== nodeRef.current.id &&
        state.selectedType === 'node' &&
        state.selectedIds.length === 0
      ) {
        const srcNode = state.nodes[prevSelected]
        const { srcSide, tgtSide } = computeBestPorts(srcNode, nodeRef.current)
        setPendingLink(prevSelected, srcSide, nodeRef.current.id, tgtSide)
      } else {
        select(nodeRef.current.id, 'node')
      }
    }

    pointerRef.current = null
  }

  const { stroke } = NODE_TYPES[node.type] ?? NODE_TYPES.goal

  const nodePadX = (node.type === 'goal' || node.type === 'task' || node.type === 'softgoal') ? GOAL_PAD_X : NODE_PAD_X
  const lines = wrapLabel(node.label || `[${node.type}]`, node.width, nodePadX)
  const cx = node.width / 2
  const textAreaH = node.height - NODE_BADGE_H / 2
  const cy = textAreaH / 2

  const badgeCY = node.height
  const badgeW = node.type.length * BADGE_CHAR_W + BADGE_PAD_X * 2

  return (
    <g
      ref={gRef}
      transform={`translate(${node.x},${node.y})`}
      style={{
        cursor: 'move', touchAction: 'none',
        opacity: isHidden ? 0 : 1,
        pointerEvents: isHidden ? 'none' : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {node.type === 'task' ? (
        <path
          d={`M ${GOAL_PAD_X},0 L ${node.width - GOAL_PAD_X},0 L ${node.width},${node.height / 2} L ${node.width - GOAL_PAD_X},${node.height} L ${GOAL_PAD_X},${node.height} L 0,${node.height / 2} Z`}
          fill={hlFill}
          stroke={isSelected ? '#0070f3' : stroke}
          strokeWidth={isSelected ? 2 : 1}
        />
      ) : (
        <>
          <rect
            width={node.width}
            height={node.height}
            rx={(node.type === 'goal' || node.type === 'softgoal') ? node.height / 2 : 0}
            fill={hlFill}
            stroke={isSelected ? '#0070f3' : stroke}
            strokeWidth={isSelected ? 2 : 1}
          />
          {node.type === 'softgoal' && (
            <>
              <defs>
                <clipPath id={`sg-${node.id}`}>
                  <rect width={node.width} height={node.height} rx={node.height / 2} />
                </clipPath>
              </defs>
              <line
                x1={7} y1={0} x2={7} y2={node.height}
                stroke={isSelected ? '#0070f3' : stroke} strokeWidth={1}
                clipPath={`url(#sg-${node.id})`}
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={11} y1={0} x2={11} y2={node.height}
                stroke={isSelected ? '#0070f3' : stroke} strokeWidth={1}
                clipPath={`url(#sg-${node.id})`}
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={node.width - 11} y1={0} x2={node.width - 11} y2={node.height}
                stroke={isSelected ? '#0070f3' : stroke} strokeWidth={1}
                clipPath={`url(#sg-${node.id})`}
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={node.width - 7} y1={0} x2={node.width - 7} y2={node.height}
                stroke={isSelected ? '#0070f3' : stroke} strokeWidth={1}
                clipPath={`url(#sg-${node.id})`}
                style={{ pointerEvents: 'none' }}
              />
            </>
          )}
        </>
      )}

      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontFamily="sans-serif"
        fill="#222"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {lines.map((line, i) => (
          <tspan
            key={i}
            x={cx}
            y={cy + (i - (lines.length - 1) / 2) * NODE_LINE_H}
          >
            {line}
          </tspan>
        ))}
      </text>

      {/* Type badge — centred on the bottom edge */}
      <rect
        x={cx - badgeW / 2}
        y={badgeCY - NODE_BADGE_H / 2}
        width={badgeW}
        height={NODE_BADGE_H}
        rx={NODE_BADGE_H / 2}
        fill="white"
        stroke={isSelected ? '#0070f3' : stroke}
        strokeWidth={isSelected ? 2 : 1}
        style={{ pointerEvents: 'none' }}
      />
      <text
        x={cx}
        y={badgeCY}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontFamily="sans-serif"
        fill="#333"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {node.type.toUpperCase()}
      </text>
    </g>
  )
}
