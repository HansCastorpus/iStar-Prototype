import { useState, useRef, useEffect } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { worldToScreen } from '../contexts/ZoomContext.jsx'
import { placePopup, connectorPoints, inflate } from './placement.js'

const NODE_WEIGHT = 1     // overlap cost per px² of covered node
const LINK_WEIGHT = 0.4   // link lines are thin, so covering them matters less
const POPUP_WEIGHT = 40   // never stack one popup on another

// Screen rects of the popups currently on screen, keyed by popup id
const usePopupRects = create(set => ({
  rects: {},
  setRect: (id, rect) => set(s => ({ rects: { ...s.rects, [id]: rect } })),
}))

// Screen rect of a list of world-space points / rects
export function screenBounds(rects, transform) {
  const x1 = Math.min(...rects.map(r => r.x)), y1 = Math.min(...rects.map(r => r.y))
  const x2 = Math.max(...rects.map(r => r.x + (r.width ?? 0)))
  const y2 = Math.max(...rects.map(r => r.y + (r.height ?? 0)))
  const a = worldToScreen(x1, y1, transform), b = worldToScreen(x2, y2, transform)
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }
}

// Screen rect around a world-space line segment
export function segmentBounds(p1, p2, transform, pad = 4) {
  const a = worldToScreen(p1.x, p1.y, transform)
  const b = worldToScreen(p2.x, p2.y, transform)
  return {
    x: Math.min(a.x, b.x) - pad, y: Math.min(a.y, b.y) - pad,
    w: Math.abs(b.x - a.x) + 2 * pad, h: Math.abs(b.y - a.y) + 2 * pad,
  }
}

// Everything on screen a popup should avoid covering; `weights` overrides per node/link id
export function diagramObstacles({ nodes, linkPaths, transform, weights = {} }) {
  const obstacles = []
  for (const n of Object.values(nodes))
    obstacles.push({ ...inflate(screenBounds([n], transform), 6), weight: weights[n.id] ?? NODE_WEIGHT })
  for (const [id, path] of Object.entries(linkPaths)) {
    if (!path) continue
    const weight = weights[id] ?? LINK_WEIGHT
    for (let i = 1; i < path.length; i++)
      obstacles.push({ ...segmentBounds(path[i - 1], path[i], transform), weight })
  }
  return obstacles
}

// Auto-placement + manual dragging for a canvas popup.
//   id:           this popup's name, published so other popups can avoid it
//   avoid:        ids of other popups this one must not cover
//   anchor:       screen rect the popup belongs to (or null)
//   getObstacles: () => obstacles, only called while auto-placing
//   resetKey:     a change drops any manual (dragged) position
export function usePopupPlacement({ id, avoid = [], anchor, getObstacles, resetKey }) {
  const [pinned, setPinned] = useState(null)  // position set by dragging; overrides auto placement
  const [popEl, setPopEl] = useState(null)
  const [size, setSize] = useState({ w: 180, h: 160 })
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })
  const handleRef = useRef(null)
  const dragStateRef = useRef(null)

  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    setPinned(null)
  }

  // Track the popup's own size and the canvas area it is placed in
  useEffect(() => {
    if (!popEl) return
    const parent = popEl.parentElement
    const ro = new ResizeObserver(() => {
      setSize(s => (s.w === popEl.offsetWidth && s.h === popEl.offsetHeight) ? s : { w: popEl.offsetWidth, h: popEl.offsetHeight })
      setViewport(v => (v.w === parent.clientWidth && v.h === parent.clientHeight) ? v : { w: parent.clientWidth, h: parent.clientHeight })
    })
    ro.observe(popEl)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [popEl])

  const otherRects = usePopupRects(useShallow(s => avoid.map(k => s.rects[k] ?? null)))
  const setRect = usePopupRects(s => s.setRect)

  const pos = anchor && (pinned ?? placePopup({
    anchor, size, viewport,
    obstacles: [
      ...getObstacles(),
      ...otherRects.filter(Boolean).map(r => ({ ...inflate(r, 8), weight: POPUP_WEIGHT })),
    ],
  }))

  // Publish where this popup ended up (or that it is gone)
  const px = pos?.x, py = pos?.y
  useEffect(() => {
    setRect(id, px == null || !popEl ? null : { x: px, y: py, w: size.w, h: size.h })
  }, [id, px, py, size.w, size.h, popEl, setRect])
  useEffect(() => () => setRect(id, null), [id, setRect])

  const onPointerDown = (e) => {
    if (e.button !== 0 || !pos) return
    e.preventDefault()
    handleRef.current.setPointerCapture(e.pointerId)
    dragStateRef.current = { pointerId: e.pointerId, startX: e.clientX - pos.x, startY: e.clientY - pos.y }
  }
  const onPointerMove = (e) => {
    if (!dragStateRef.current || e.pointerId !== dragStateRef.current.pointerId) return
    setPinned({ x: e.clientX - dragStateRef.current.startX, y: e.clientY - dragStateRef.current.startY })
  }
  const onPointerUp = (e) => {
    if (!dragStateRef.current || e.pointerId !== dragStateRef.current.pointerId) return
    handleRef.current.releasePointerCapture(e.pointerId)
    dragStateRef.current = null
  }

  // Connector from the popup's nearest edge to the anchor, in popup-local coords
  let connector = null
  if (pos) {
    const { p, a } = connectorPoints({ ...pos, ...size }, anchor)
    if (Math.hypot(a.x - p.x, a.y - p.y) > 6)
      connector = { x1: p.x - pos.x, y1: p.y - pos.y, x2: a.x - pos.x, y2: a.y - pos.y }
  }

  return {
    pos,
    popRef: setPopEl,
    handleRef,
    dragProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    connector,
  }
}
