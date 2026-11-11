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
import ActorPopover from './ActorPopover.jsx'
import ElementPopup from './ElementPopup.jsx'
import ZoneLayer from './ZoneLayer.jsx'
import { actorLayout, actorNames, strayElements, inActor } from '../utils/actorTree.js'
import { barLayout } from '../utils/actorBars.js'
import { computeLinkSlots } from '../utils/layout.js'
import { computeAllPaths } from '../utils/routing.js'
import { computeCrossings } from '../utils/crossings.js'
import { GRID } from '../utils/grid.js'
import { INBOX_DRAG } from './InboxPanel.jsx'

const MIN_CLEARANCE = GRID * 2
const VIEWER_CARDS_W = 242  // the viewer's column of cards on the right (230 wide + 12 from the edge)

export default function Canvas() {
  const svgRef = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const transformRef = useRef(transform)
  const [cursorWorld, setCursorWorld] = useState({ x: 0, y: 0 })
  const modeRef = useRef('select')
  const zoomRef = useRef(null)
  const fitRequest = useStore(s => s.fitRequest)
  const zoomRequest = useStore(s => s.zoomRequest)

  const viewer = useStore(s => s.viewer)
  const showGrid = useStore(s => s.showGrid)
  const showClearance = useStore(s => s.showClearance)
  const { nodes, links, actors, mode, addNode, deselect, deselectAll, clearConnect, draggingNodeId, selectedIds, selectedId, selectedType } = useStore()

  // Keep refs in sync with reactive values.
  useEffect(() => { modeRef.current = mode }, [mode])

  // Load saved diagram on mount.

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
    zoomRef.current = zoom
    svg.on('dblclick.zoom', null)
    return () => svg.on('.zoom', null)
  }, [])

  // Frame the given elements, centred in the visible area (animated when asked); never zooms in past 100%.
  // screenCentered: centre them on the middle of the whole screen instead, leaving the same clear room on both sides
  // (the width of the side panel that covers the canvas: the filter panel, and in the viewer the cards on the right)
  const frameNodes = useCallback((list, animate = false, insetLeft = 0, maxK = 1, screenCentered = false) => {
    const svgEl = svgRef.current
    if (!list.length || !svgEl || !zoomRef.current) return
    const minX = Math.min(...list.map(n => n.x)), maxX = Math.max(...list.map(n => n.x + n.width))
    const minY = Math.min(...list.map(n => n.y)), maxY = Math.max(...list.map(n => n.y + n.height))
    const rect = svgEl.getBoundingClientRect()
    const st = useStore.getState()
    insetLeft += st.filterPanelRight ?? 0  // the filter panel floats over the canvas
    const insetRight = screenCentered && st.viewer && !st.cardsHidden ? VIEWER_CARDS_W : 0
    const side = Math.max(insetLeft, insetRight)
    const left = screenCentered ? side : insetLeft  // where the clear area starts
    const width = screenCentered ? rect.width - 2 * side : rect.width - insetLeft, height = rect.height  // minus the part covered by side panels
    const margin = 80
    const k = Math.min(maxK, (width - margin * 2) / (maxX - minX), (height - margin * 2) / (maxY - minY))
    const t = d3.zoomIdentity
      .translate(left + width / 2, height / 2).scale(Math.max(k, 0.1))
      .translate(-(minX + maxX) / 2, -(minY + maxY) / 2)
    const sel = d3.select(svgEl)
    ;(animate ? sel.transition().duration(400) : sel).call(zoomRef.current.transform, t)
  }, [])

  // Frame the whole graph on mount and whenever a project is loaded
  useEffect(() => {
    frameNodes(Object.values(useStore.getState().nodes))
  }, [fitRequest, frameNodes])

  // Zoom to one actor when asked (the actor panel's magnifier button)
  useEffect(() => {
    if (!zoomRequest) return
    const all = Object.values(useStore.getState().nodes)
    if (zoomRequest.nodeId) {
      const node = useStore.getState().nodes[zoomRequest.nodeId]
      if (node) frameNodes([node], true, 0, 1.5)
    } else {
      // Centre on the actor's whole area (its name bar and padding included), in the middle of the screen
      const st = useStore.getState()
      const pts = actorLayout(st.nodes, actorNames(st.actors)).points[zoomRequest.actorId]
      if (pts?.length) {
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
        frameNodes([{ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }],
          true, zoomRequest.insetLeft, 1, true)
      } else frameNodes(all.filter(n => inActor(n, zoomRequest.actorId)), true, zoomRequest.insetLeft, 1, true)
    }
  }, [zoomRequest, frameNodes])

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
    } else {
      const hadPendingLink = !!useStore.getState().pendingLink
      clearConnect()
      if (!hadPendingLink) deselect()
      useStore.getState().clearActorPick()  // viewer: the picked actor stops being highlighted
    }
  }

  // An element dragged out of the inbox is placed where it is dropped
  const handleDragOver = (e) => {
    if (e.dataTransfer.types.includes(INBOX_DRAG)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  }
  const handleDrop = (e) => {
    const itemId = e.dataTransfer.getData(INBOX_DRAG)
    if (!itemId) return
    e.preventDefault()
    const rect = svgRef.current.getBoundingClientRect()
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    useStore.getState().placeInboxItem(itemId, world.x, world.y)
  }

  // Double click on empty space clears everything selected, actors included
  const handleCanvasDoubleClick = (e) => {
    if (!e.target.classList.contains('canvas-bg')) return
    if (modeRef.current.startsWith('add-')) return
    deselectAll()
    useStore.getState().clearActorPick()
  }

  const linkSlots = useMemo(() => computeLinkSlots(nodes, links), [nodes, links])
  const linkPaths = useMemo(() => computeAllPaths(nodes, linkSlots, links), [nodes, linkSlots, links])

  const strays = useMemo(() => strayElements(nodes, actorNames(actors)), [nodes, actors])
  // How each actor's name bar is widened / where its name sits so that no link crosses the name
  const bars = useMemo(() => barLayout(nodes, actorNames(actors), linkPaths), [nodes, actors, linkPaths])
  const crossings = useMemo(() => computeCrossings(links, linkPaths), [links, linkPaths])

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
      {/* The editing popups don't exist in a read-only share */}
      {!viewer && <>
        <PropertyPopover linkPaths={linkPaths} />
        <LinkTypePopup linkPaths={linkPaths} />
        <ActorPopover linkPaths={linkPaths} />
      </>}
      {/* ...and the read-only popup with an element's information is the viewer's */}
      {viewer && <ElementPopup linkPaths={linkPaths} />}
      <svg
        ref={svgRef}
        id="diagram-canvas"
        style={{ width: '100%', height: '100%', display: 'block', background: 'var(--bg-canvas)' }}
        onMouseMove={handleMouseMove}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Infinite background — pan target */}
        <rect className="canvas-bg" x="-50000" y="-50000"
          width="100000" height="100000" fill="transparent" />

        <g transform={`translate(${x},${y}) scale(${k})`}>
          {/* Light grid (a view aid); skipped when zoomed out so far that the lines would just be a smear */}
          {showGrid && k * GRID >= 6 && (
            <g data-view-aid style={{ pointerEvents: 'none' }}>
              <defs>
                <pattern id="view-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                  <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="var(--grid-line)" strokeWidth={1 / k} />
                </pattern>
              </defs>
              <rect x="-50000" y="-50000" width="100000" height="100000" fill="url(#view-grid)" />
            </g>
          )}

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
          {/* outer actors first, so nested ones (and their backgrounds) are drawn on top of them */}
          {(() => {
            const { shade } = actorLayout(nodes)
            return Object.values(actors).sort((a, b) => (shade[a.id]?.depth ?? 0) - (shade[b.id]?.depth ?? 0))
          })().map((actor) => (
            <Actor key={actor.id} actor={actor} extras={bars.extras} offset={bars.offsets[actor.id] ?? 0} />
          ))}

          {/* Risk zones: soft red areas around the elements marked with them, above the actors and below the links */}
          <ZoneLayer />

          {/* Clearance outlines — the zone no other element may enter; always shown when switched on in
              Options, otherwise only while dragging a node */}
          {(showClearance || draggingNodeId) && Object.values(nodes)
            .filter(n => showClearance || (n.id !== draggingNodeId && !selectedIds.includes(n.id)))
            .map(n => (
              <rect
                key={n.id}
                data-view-aid
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

          {/* Links above actors */}
          {Object.values(links).map((link) => (
            <Link key={link.id} link={link} points={linkPaths[link.id]} andBar={andBarMap[link.id]} allPaths={linkPaths} crossings={crossings[link.id]} />
          ))}

          {/* Nodes on top */}
          {Object.values(nodes).map((node) => (
            <Node key={node.id} node={node} strayActors={strays[node.id]} />
          ))}

          {/* Rubber-band preview while connecting */}
          <LinkPreview cursorWorld={cursorWorld} />
        </g>
      </svg>
    </ZoomContext.Provider>
  )
}
