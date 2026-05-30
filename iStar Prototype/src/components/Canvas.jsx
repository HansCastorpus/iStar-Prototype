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

const MIN_CLEARANCE = GRID * 2

export default function Canvas() {
  const svgRef = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const transformRef = useRef(transform)
  const [cursorWorld, setCursorWorld] = useState({ x: 0, y: 0 })
  const modeRef = useRef('select')

  const { nodes, links, actors, mode, addNode, deselect, clearConnect, draggingNodeId, selectedIds, selectedId, selectedType } = useStore()

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

  // AND-bar: group AND links by target+side, compute one spanning perpendicular
  // bar per group so multiple AND links on the same node face share a continuous line.
  const AND_ICON_DIST = 17  // ARROW_H(8) + ICON_GAP(4) + ICON_R(5)
  const AND_BAR_PAD   =  5  // overhang beyond the outermost icon center
  const andBarMap = useMemo(() => {
    const groups = {}
    for (const [id, link] of Object.entries(links)) {
      if (link.type !== 'and') continue
      const slots = linkSlots[id]
      if (!slots) continue
      const key = `${link.targetId}/${slots.targetSlot.side}`
      if (!groups[key]) groups[key] = []
      groups[key].push(id)
    }
    const result = {}
    for (const ids of Object.values(groups)) {
      const centers = []
      for (const id of ids) {
        const path = linkPaths[id]
        if (!path || path.length < 2) continue
        const p1 = path[path.length - 2], p2 = path[path.length - 1]
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        if (len === 0) continue
        const dx = (p2.x - p1.x) / len, dy = (p2.y - p1.y) / len
        centers.push({ id, x: p2.x - dx * AND_ICON_DIST, y: p2.y - dy * AND_ICON_DIST, dx, dy })
      }
      if (centers.length === 0) continue
      const { dx, dy } = centers[0]
      if (Math.abs(dy) > Math.abs(dx)) {
        // Mostly vertical approach → horizontal bar spanning all x positions
        const minX = Math.min(...centers.map(c => c.x)) - AND_BAR_PAD
        const maxX = Math.max(...centers.map(c => c.x)) + AND_BAR_PAD
        const barY = centers.reduce((s, c) => s + c.y, 0) / centers.length
        for (const { id } of centers) result[id] = { x1: minX, y1: barY, x2: maxX, y2: barY }
      } else {
        // Mostly horizontal approach → vertical bar spanning all y positions
        const minY = Math.min(...centers.map(c => c.y)) - AND_BAR_PAD
        const maxY = Math.max(...centers.map(c => c.y)) + AND_BAR_PAD
        const barX = centers.reduce((s, c) => s + c.x, 0) / centers.length
        for (const { id } of centers) result[id] = { x1: barX, y1: minY, x2: barX, y2: maxY }
      }
    }
    return result
  }, [links, linkSlots, linkPaths])

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

          {/* Port zone overlay — hidden; keep for debugging (re-enable by removing `false &&`) */}
          {false && selectedType === 'node' && selectedId && nodes[selectedId] && (() => {
            const n = nodes[selectedId]
            const cx = n.x + n.width / 2
            const cy = n.y + n.height / 2
            const R = 3000
            const hw = n.height / n.width  // h/w — slope of the zone boundary
            const zones = [
              { points: `${cx},${cy} ${cx+R},${cy - R*hw} ${cx+R},${cy + R*hw}`, label: 'right',  lx: cx + R*0.5, ly: cy,         fill: '#3b82f6' },
              { points: `${cx},${cy} ${cx-R},${cy - R*hw} ${cx-R},${cy + R*hw}`, label: 'left',   lx: cx - R*0.5, ly: cy,         fill: '#22c55e' },
              { points: `${cx},${cy} ${cx - R/hw},${cy-R} ${cx + R/hw},${cy-R}`, label: 'top',    lx: cx,         ly: cy - R*0.5, fill: '#f97316' },
              { points: `${cx},${cy} ${cx - R/hw},${cy+R} ${cx + R/hw},${cy+R}`, label: 'bottom', lx: cx,         ly: cy + R*0.5, fill: '#a855f7' },
            ]
            return (
              <g style={{ pointerEvents: 'none' }}>
                {zones.map(z => (
                  <polygon key={z.label} points={z.points} fill={z.fill} opacity={0.08} />
                ))}
                <line x1={cx-R} y1={cy - R*hw} x2={cx+R} y2={cy + R*hw} stroke="#94a3b8" strokeWidth={1} strokeDasharray="6 3" />
                <line x1={cx-R} y1={cy + R*hw} x2={cx+R} y2={cy - R*hw} stroke="#94a3b8" strokeWidth={1} strokeDasharray="6 3" />
                {zones.map(z => (
                  <text key={z.label} x={z.lx} y={z.ly} textAnchor="middle" dominantBaseline="central"
                    fontSize={11} fontFamily="sans-serif" fill={z.fill} opacity={0.7}>
                    {z.label}
                  </text>
                ))}
              </g>
            )
          })()}

          {/* Actors sit below everything */}
          {Object.values(actors).map((actor) => (
            <Actor key={actor.id} actor={actor} />
          ))}

          {/* Links above actors */}
          {Object.values(links).map((link) => (
            <Link key={link.id} link={link} points={linkPaths[link.id]} andBar={andBarMap[link.id]} />
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
