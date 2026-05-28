import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import useStore from '../store/useStore.js'
import { getHoverPorts } from '../utils/ports.js'

const PORT_R = 5
const NODE_TYPES = {
  goal:      { label: 'Goal',      stroke: '#333' },
  task:      { label: 'Task',      stroke: '#333' },
  softgoal:  { label: 'Softgoal',  stroke: '#333' },
  resource:  { label: 'Resource',  stroke: '#333' },
}

export default function Node({ node }) {
  const gRef = useRef(null)
  const nodeRef = useRef(node)
  useEffect(() => { nodeRef.current = node }, [node])

  const [hovered, setHovered] = useState(false)

  const { mode, selectedId, select, moveNode, setConnectSource, setPendingLink, connectSource } =
    useStore()

  const isSelected = selectedId === node.id
  const showPorts = (mode === 'connect') && (hovered || connectSource?.nodeId === node.id)

  // Attach d3.drag once per node id.
  useEffect(() => {
    let dragging = false

    const drag = d3.drag()
      .subject(() => ({ x: nodeRef.current.x, y: nodeRef.current.y }))
      .on('start', () => { dragging = false })
      .on('drag', (event) => {
        dragging = true
        moveNode(nodeRef.current.id, event.x, event.y)
      })
      .on('end', () => {
        if (!dragging) select(nodeRef.current.id, 'node')
      })

    // Only enable drag in select mode — guard via filter.
    drag.filter((event) => {
      return useStore.getState().mode === 'select' &&
             !event.target.classList.contains('port-dot')
    })

    d3.select(gRef.current).call(drag)
    return () => d3.select(gRef.current).on('.drag', null)
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePortClick = (e, side) => {
    e.stopPropagation()
    const src = useStore.getState().connectSource

    if (!src) {
      setConnectSource(node.id, side)
    } else if (src.nodeId !== node.id) {
      setPendingLink(src.nodeId, src.side, node.id, side)
    }
    // clicking own port cancels
    else {
      useStore.getState().clearConnect()
    }
  }

  const ports = getHoverPorts(node)
  const { stroke } = NODE_TYPES[node.type] ?? NODE_TYPES.goal

  return (
    <g
      ref={gRef}
      transform={`translate(${node.x},${node.y})`}
      style={{ cursor: mode === 'select' ? 'move' : 'default' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <rect
        width={node.width}
        height={node.height}
        fill="white"
        stroke={isSelected ? '#0070f3' : stroke}
        strokeWidth={isSelected ? 2 : 1}
      />

      <text
        x={node.width / 2}
        y={node.height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fill="#222"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {node.label || `[${node.type}]`}
      </text>

      {/* Type label in top-left corner */}
      <text
        x={3}
        y={9}
        fontSize={8}
        fill="#999"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {node.type}
      </text>

      {/* Port dots — visible in connect mode on hover */}
      {showPorts && ports.map(({ side, x, y }) => (
        <circle
          key={side}
          className="port-dot"
          cx={x - node.x}
          cy={y - node.y}
          r={PORT_R}
          fill={connectSource?.nodeId === node.id && connectSource?.side === side
            ? '#0070f3' : '#fff'}
          stroke="#0070f3"
          strokeWidth={1.5}
          style={{ cursor: 'crosshair' }}
          onClick={(e) => handlePortClick(e, side)}
        />
      ))}
    </g>
  )
}
