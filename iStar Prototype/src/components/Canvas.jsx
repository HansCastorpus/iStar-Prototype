import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as d3 from 'd3'
import useStore from '../store/useStore.js'
import { ZoomContext } from '../contexts/ZoomContext.jsx'
import Node from './Node.jsx'
import Link from './Link.jsx'
import Actor from './Actor.jsx'
import LinkPreview from './LinkPreview.jsx'
import PropertyPopover from './PropertyPopover.jsx'
import LinkTypePopup from './LinkTypePopup.jsx'
import { computeLinkSlots } from '../utils/layout.js'
import { computeAllPaths } from '../utils/routing.js'
import { GRID } from '../utils/grid.js'

const MIN_CLEARANCE = GRID * 4

export default function Canvas() {
  const svgRef = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const transformRef = useRef(transform)
  const [cursorWorld, setCursorWorld] = useState({ x: 0, y: 0 })
  const modeRef = useRef('select')

  const { nodes, links, actors, mode, addNode, deselect, clearConnect, draggingNodeId, selectedIds } = useStore()

  // Keep refs in sync with reactive values.
  useEffect(() => { modeRef.current = mode }, [mode])

  // Load saved diagram on mount.
  useEffect(() => { useStore.getState().loadFromStorage() }, [])

  // Set up d3-zoom.
  useEffect(() => {
    const svg = d3.select(svgRef.current)
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .filter((event) => {
        if (event.type === 'wheel') return true
        if (event.type === 'mousedown' && event.button === 0)
          return modeRef.current === 'select' &&
                 event.target.classList.contains('canvas-bg')
        return false
      })
      .on('zoom', (event) => {
        const t = event.transform
        transformRef.current = t
        setTransform({ x: t.x, y: t.y, k: t.k })
      })

    svg.call(zoom)
    svg.on('dblclick.zoom', null)
    return () => svg.on('.zoom', null)
  }, [])

  const screenToWorld = useCallback((cx, cy) => ({
    x: (cx - transformRef.current.x) / transformRef.current.k,
    y: (cy - transformRef.current.y) / transformRef.current.k,
  }), [])

  const handleMouseMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    setCursorWorld(screenToWorld(e.clientX - rect.left, e.clientY - rect.top))
  }

  const handleCanvasClick = (e) => {
    if (!e.target.classList.contains('canvas-bg')) return
    const rect = svgRef.current.getBoundingClientRect()
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

    if (modeRef.current.startsWith('add-')) {
      addNode(modeRef.current.replace('add-', ''), world.x, world.y)
    } else if (modeRef.current === 'connect') {
      clearConnect()
    } else {
      deselect()
    }
  }

  const linkSlots = useMemo(() => computeLinkSlots(nodes, links), [nodes, links])
  const linkPaths = useMemo(() => computeAllPaths(nodes, linkSlots, links), [nodes, linkSlots, links])
  const { x, y, k } = transform

  return (
    <ZoomContext.Provider value={{ transform, transformRef }}>
      <PropertyPopover />
      <LinkTypePopup />
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', display: 'block', background: '#f8f8f8' }}
        onMouseMove={handleMouseMove}
        onClick={handleCanvasClick}
      >
        <defs>
          <marker id="arrow-default" markerWidth="8" markerHeight="6"
            refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#555" />
          </marker>
        </defs>

        {/* Infinite background — pan target */}
        <rect className="canvas-bg" x="-50000" y="-50000"
          width="100000" height="100000" fill="transparent" />

        <g transform={`translate(${x},${y}) scale(${k})`}>
          {/* Clearance outlines — visible only while dragging a node */}
          {draggingNodeId && Object.values(nodes)
            .filter(n => n.id !== draggingNodeId && !selectedIds.includes(n.id))
            .map(n => (
              <rect
                key={n.id}
                x={n.x - MIN_CLEARANCE}
                y={n.y - MIN_CLEARANCE}
                width={n.width  + MIN_CLEARANCE * 2}
                height={n.height + MIN_CLEARANCE * 2}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="5 3"
                style={{ pointerEvents: 'none' }}
              />
            ))
          }

          {/* Actors sit below everything */}
          {Object.values(actors).map((actor) => (
            <Actor key={actor.id} actor={actor} />
          ))}

          {/* Links above actors */}
          {Object.values(links).map((link) => (
            <Link key={link.id} link={link} points={linkPaths[link.id]} />
          ))}

          {/* Nodes on top */}
          {Object.values(nodes).map((node) => (
            <Node key={node.id} node={node} />
          ))}

          {/* Rubber-band preview while connecting */}
          <LinkPreview cursorWorld={cursorWorld} />
        </g>
      </svg>
    </ZoomContext.Provider>
  )
}
