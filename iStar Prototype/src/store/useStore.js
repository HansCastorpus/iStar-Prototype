import { create } from 'zustand'
import { GRID, snap, computeNodeSize } from '../utils/grid.js'
import { getUsedOffsets, getNextSlot } from '../utils/ports.js'

const MIN_CLEARANCE = GRID * 2
const ACTOR_GAP = 20

export const ALL_TYPES = [
  'goal', 'task', 'softgoal', 'resource',
  'depends-on', 'or', 'xor', 'and', 'help', 'hurt', 'make', 'break', 'needed-by', 'part-of',
]
const HULL_PAD = 20  // must match Actor.jsx PAD
const ALIGN_SNAP = 12  // px — snap to other nodes' center axes within this distance

function alignSnap(x, y, width, height, nodes, excludeId) {
  const cx = x + width / 2
  const cy = y + height / 2
  let nx = x, ny = y
  for (const other of Object.values(nodes)) {
    if (other.id === excludeId) continue
    const ocx = other.x + other.width  / 2
    const ocy = other.y + other.height / 2
    if (Math.abs(cx - ocx) < ALIGN_SNAP) nx = ocx - width  / 2
    if (Math.abs(cy - ocy) < ALIGN_SNAP) ny = ocy - height / 2
  }
  return { x: nx, y: ny }
}

function tooClose(x, y, w, h, nodes, excludeId = null) {
  return Object.values(nodes).some((other) => {
    if (other.id === excludeId) return false
    const gapH = Math.max(other.x - (x + w), x - (other.x + other.width))
    const gapV = Math.max(other.y - (y + h), y - (other.y + other.height))
    return !(gapH >= MIN_CLEARANCE || gapV >= MIN_CLEARANCE)
  })
}

// Compute octilinear extent values for all nodes belonging to actorId.
function computeActorExtents(nodes, actorId) {
  let a = -Infinity, b = -Infinity, c = -Infinity, d = -Infinity
  let e = -Infinity, f = -Infinity, g = -Infinity, h = -Infinity
  let hasMembers = false

  for (const n of Object.values(nodes)) {
    if (n.actorId !== actorId) continue
    hasMembers = true
    const pts = [
      { x: n.x - HULL_PAD,           y: n.y - HULL_PAD            },
      { x: n.x + n.width + HULL_PAD, y: n.y - HULL_PAD            },
      { x: n.x - HULL_PAD,           y: n.y + n.height + HULL_PAD },
      { x: n.x + n.width + HULL_PAD, y: n.y + n.height + HULL_PAD },
    ]
    for (const { x: px, y: py } of pts) {
      if (px        > a) a = px
      if (px + py   > b) b = px + py
      if (py        > c) c = py
      if (-px + py  > d) d = -px + py
      if (-px       > e) e = -px
      if (-px - py  > f) f = -px - py
      if (-py       > g) g = -py
      if (px - py   > h) h = px - py
    }
  }
  return hasMembers ? { a, b, c, d, e, f, g, h } : null
}

// SAT check for two octilinear hulls: returns true if they are separated by
// at least `gap` pixels along any of the 4 octilinear axis directions.
function hullsSeparated(e1, e2, gap) {
  return (
    e1.a + e2.e + gap <= 0 || e2.a + e1.e + gap <= 0 ||
    e1.c + e2.g + gap <= 0 || e2.c + e1.g + gap <= 0 ||
    e1.b + e2.f + gap <= 0 || e2.b + e1.f + gap <= 0 ||
    e1.d + e2.h + gap <= 0 || e2.d + e1.h + gap <= 0
  )
}

const useStore = create((set, get) => ({
  // ── Diagram data ────────────────────────────────────────────────────────────
  actors: {},
  nodes: {},
  links: {},

  // ── Interaction state ────────────────────────────────────────────────────────
  // mode: 'select' | 'add-goal' | 'add-task' | 'add-softgoal' | 'add-resource' | 'connect'
  mode: 'select',
  selectedId: null,
  selectedType: null,  // 'node' | 'link'
  connectSource: null, // { nodeId, side } — set when user clicks a source port
  pendingLink: null,   // { sourceId, sourceSide, targetId, targetSide } — awaiting type choice
  draggingNodeId: null,
  selectedIds: [],    // multi-select node IDs

  // ── Dark mode ────────────────────────────────────────────────────────────────
  darkMode: false,
  toggleDarkMode: () => set(s => ({ darkMode: !s.darkMode })),
  legendOpen: false,
  toggleLegend: () => set(s => ({ legendOpen: !s.legendOpen })),
  hideTags: false,
  toggleHideTags: () => set(s => ({ hideTags: !s.hideTags })),

  // ── Filter ───────────────────────────────────────────────────────────────────
  highlightTypes: [],              // types currently highlighted; empty = mode off
  isolateTypes:   [...ALL_TYPES],  // types currently isolated;   empty = mode off
  focusNodeId:    null,            // when set, dims all links not connected to this node
  focusDeep:      false,           // when true, use transitive closure instead of direct links only

  toggleHighlightType: (type) => set(s => {
    const has = s.highlightTypes.includes(type)
    return { highlightTypes: has ? s.highlightTypes.filter(t => t !== type) : [...s.highlightTypes, type] }
  }),

  toggleIsolateType: (type) => set(s => {
    const has = s.isolateTypes.includes(type)
    return { isolateTypes: has ? s.isolateTypes.filter(t => t !== type) : [...s.isolateTypes, type] }
  }),

  filterSelectAll:  () => set({ highlightTypes: [...ALL_TYPES], isolateTypes: [...ALL_TYPES] }),
  filterSelectNone: () => set({ highlightTypes: [], isolateTypes: [] }),
  toggleAllHighlight: () => set(s => ({
    highlightTypes: s.highlightTypes.length === ALL_TYPES.length ? [] : [...ALL_TYPES],
  })),
  toggleAllIsolate: () => set(s => ({
    isolateTypes: s.isolateTypes.length === ALL_TYPES.length ? [] : [...ALL_TYPES],
  })),

  setFocusNode: (id, deep = false) => set(s => {
    const same = s.focusNodeId === id && s.focusDeep === deep
    return { focusNodeId: same ? null : id, focusDeep: same ? false : deep }
  }),

  // ── Mode ─────────────────────────────────────────────────────────────────────
  setMode: (mode) => set({ mode, connectSource: null, pendingLink: null }),
  setDraggingNode: (id) => set({ draggingNodeId: id }),

  // ── Selection ────────────────────────────────────────────────────────────────
  select: (id, type) => set({ selectedId: id, selectedType: type, selectedIds: [] }),
  deselect: () => set({ selectedId: null, selectedType: null, selectedIds: [], focusNodeId: null, focusDeep: false }),

  addToSelection: (id) => set(s => {
    const base = (s.selectedIds.length === 0 && s.selectedId && s.selectedType === 'node')
      ? [s.selectedId]
      : s.selectedIds
    const has = base.includes(id)
    const selectedIds = has ? base.filter(x => x !== id) : [...base, id]
    return {
      selectedIds,
      selectedId: selectedIds.length ? (has ? selectedIds[selectedIds.length - 1] ?? null : id) : null,
      selectedType: selectedIds.length ? 'node' : null,
    }
  }),

  selectActorNodes: (actorId) => set(s => {
    const ids = Object.values(s.nodes)
      .filter(n => n.actorId === actorId)
      .map(n => n.id)
    return { selectedIds: ids, selectedId: null, selectedType: null }
  }),

  // ── Nodes ────────────────────────────────────────────────────────────────────
  addNode: (type, x, y) => {
    const id = crypto.randomUUID()
    const { width, height } = computeNodeSize('', type)
    const currentNodes = get().nodes

    let nx = snap(x - width  / 2)
    let ny = snap(y - height / 2)

    // If cursor position is too close to an existing node, spiral outward in
    // MIN_CLEARANCE steps until a clear spot is found (up to 5 rings).
    if (tooClose(nx, ny, width, height, currentNodes)) {
      let found = false
      outer: for (let r = 1; r <= 5; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
            const tx = snap(nx + dx * MIN_CLEARANCE)
            const ty = snap(ny + dy * MIN_CLEARANCE)
            if (!tooClose(tx, ty, width, height, currentNodes)) {
              nx = tx; ny = ty; found = true; break outer
            }
          }
        }
      }
      if (!found) return null
    }

    // Snap to other nodes' center axes on placement.
    const aligned = alignSnap(nx, ny, width, height, currentNodes, null)
    nx = aligned.x
    ny = aligned.y

    set((s) => ({
      nodes: {
        ...s.nodes,
        [id]: { id, type, label: '', actorId: null, x: nx, y: ny, width, height },
      },
      selectedId: id,
      selectedType: 'node',
      selectedIds: [],
      mode: 'select',
    }))
    return id
  },

  updateNode: (id, updates) => set((s) => {
    const node = s.nodes[id]
    const merged = { ...node, ...updates }
    if ('label' in updates) {
      const { width, height } = computeNodeSize(updates.label, node.type)
      merged.width  = width
      merged.height = height
    }
    return { nodes: { ...s.nodes, [id]: merged } }
  }),

  moveNode: (id, x, y) => set((s) => {
    const node = s.nodes[id]
    const { x: nx, y: ny } = alignSnap(x, y, node.width, node.height, s.nodes, id)
    if (tooClose(nx, ny, node.width, node.height, s.nodes, id)) return {}

    if (node.actorId) {
      const nodesWithMoved = { ...s.nodes, [id]: { ...node, x: nx, y: ny } }
      const newExt = computeActorExtents(nodesWithMoved, node.actorId)
      if (newExt) {
        for (const actor of Object.values(s.actors)) {
          if (actor.id === node.actorId) continue
          const otherExt = computeActorExtents(s.nodes, actor.id)
          if (!otherExt) continue
          if (!hullsSeparated(newExt, otherExt, ACTOR_GAP)) return {}
        }
      }
    }

    return { nodes: { ...s.nodes, [id]: { ...node, x: nx, y: ny } } }
  }),

  moveNodeGroup: (leadId, rawX, rawY, groupIds) => set(s => {
    const lead = s.nodes[leadId]
    if (!lead) return {}
    const { x: snappedX, y: snappedY } = alignSnap(rawX, rawY, lead.width, lead.height, s.nodes, leadId)
    const dx = snappedX - lead.x
    const dy = snappedY - lead.y
    if (dx === 0 && dy === 0) return {}

    const proposed = {}
    for (const id of groupIds) {
      const n = s.nodes[id]
      if (n) proposed[id] = { x: n.x + dx, y: n.y + dy }
    }

    const nonGroup = Object.values(s.nodes).filter(n => !groupIds.includes(n.id))
    for (const id of groupIds) {
      const n = s.nodes[id]
      const { x, y } = proposed[id]
      if (nonGroup.some(o => {
        const gH = Math.max(o.x - (x + n.width), x - (o.x + o.width))
        const gV = Math.max(o.y - (y + n.height), y - (o.y + o.height))
        return !(gH >= MIN_CLEARANCE || gV >= MIN_CLEARANCE)
      })) return {}
    }

    const movedActorIds = new Set(groupIds.map(id => s.nodes[id]?.actorId).filter(Boolean))
    if (movedActorIds.size > 0) {
      const movedNodes = { ...s.nodes }
      for (const id of groupIds) movedNodes[id] = { ...s.nodes[id], ...proposed[id] }
      for (const actorId of movedActorIds) {
        const newExt = computeActorExtents(movedNodes, actorId)
        if (!newExt) continue
        for (const actor of Object.values(s.actors)) {
          if (actor.id === actorId || movedActorIds.has(actor.id)) continue
          const otherExt = computeActorExtents(s.nodes, actor.id)
          if (!otherExt) continue
          if (!hullsSeparated(newExt, otherExt, ACTOR_GAP)) return {}
        }
      }
    }

    const newNodes = { ...s.nodes }
    for (const id of groupIds) newNodes[id] = { ...s.nodes[id], ...proposed[id] }
    return { nodes: newNodes }
  }),

  deleteNode: (id) => set((s) => {
    const nodes = { ...s.nodes }
    delete nodes[id]
    const links = Object.fromEntries(
      Object.entries(s.links).filter(([, l]) => l.sourceId !== id && l.targetId !== id)
    )
    return { nodes, links, selectedId: null, selectedType: null, selectedIds: [] }
  }),

  // ── Actors ───────────────────────────────────────────────────────────────────
  // Creates an actor if the name is new; returns the id either way.
  ensureActor: (name, type = 'agent') => {
    const existing = Object.values(get().actors).find((a) => a.name === name)
    if (existing) return existing.id
    const id = crypto.randomUUID()
    set((s) => ({ actors: { ...s.actors, [id]: { id, name, type } } }))
    return id
  },

  // ── Connect flow ─────────────────────────────────────────────────────────────
  setConnectSource: (nodeId, side) => set({ connectSource: { nodeId, side } }),
  clearConnect: () => set({ connectSource: null, pendingLink: null }),

  setPendingLink: (sourceId, sourceSide, targetId, targetSide) =>
    set({ pendingLink: { sourceId, sourceSide, targetId, targetSide } }),

  confirmLink: (type) => {
    const { pendingLink, links } = get()
    if (!pendingLink) return
    const { sourceId, sourceSide, targetId, targetSide } = pendingLink

    const srcUsed = getUsedOffsets(sourceId, sourceSide, links)
    const tgtUsed = getUsedOffsets(targetId, targetSide, links)
    const id = crypto.randomUUID()

    set((s) => ({
      links: {
        ...s.links,
        [id]: {
          id,
          sourceId,
          sourceSlot: { side: sourceSide, offset: getNextSlot(srcUsed) },
          targetId,
          targetSlot: { side: targetSide, offset: getNextSlot(tgtUsed) },
          type,
          labelT: 0.5,
        },
      },
      pendingLink: null,
      connectSource: null,
    }))
  },

  updateLink: (id, updates) => set((s) => ({
    links: { ...s.links, [id]: { ...s.links[id], ...updates } },
  })),

  reverseLink: (id) => set((s) => {
    const l = s.links[id]
    if (!l) return {}
    return {
      links: {
        ...s.links,
        [id]: {
          ...l,
          sourceId:   l.targetId,
          sourceSlot: l.targetSlot,
          targetId:   l.sourceId,
          targetSlot: l.sourceSlot,
        },
      },
    }
  }),

  deleteLink: (id) => set((s) => {
    const links = { ...s.links }
    delete links[id]
    return { links, selectedId: null, selectedType: null }
  }),

  // ── Persistence ───────────────────────────────────────────────────────────────
  exportDiagram: () => {
    const { actors, nodes, links } = get()
    const json = JSON.stringify({ actors, nodes, links }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'istar-diagram.json'
    a.click()
    URL.revokeObjectURL(url)
  },

  exportAsImage: (format = 'png') => {
    const { nodes } = get()
    const svgEl = document.querySelector('#diagram-canvas')
    if (!svgEl) return

    const nodeList = Object.values(nodes)
    const PAD = 60
    const minX = (nodeList.length ? Math.min(...nodeList.map(n => n.x)) : 0) - PAD
    const minY = (nodeList.length ? Math.min(...nodeList.map(n => n.y)) : 0) - PAD
    const maxX = (nodeList.length ? Math.max(...nodeList.map(n => n.x + n.width))  : 800) + PAD
    const maxY = (nodeList.length ? Math.max(...nodeList.map(n => n.y + n.height)) : 600) + PAD
    const w = maxX - minX
    const h = maxY - minY

    const clone = svgEl.cloneNode(true)
    clone.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`)
    clone.setAttribute('width', w)
    clone.setAttribute('height', h)
    // Remove `width:100%;height:100%` inline style — in a standalone image context
    // those percentages have no containing block and collapse the SVG to 0×0.
    clone.removeAttribute('style')
    clone.querySelector('.canvas-bg')?.remove()
    const zoomG = clone.querySelector('g')
    if (zoomG) zoomG.removeAttribute('transform')

    // Resolve CSS custom properties — they are not available in a standalone SVG image
    const cs = getComputedStyle(document.documentElement)
    const cssVars = [
      '--bg-canvas', '--bg-panel', '--bg-popup',
      '--text-1', '--text-2', '--text-3', '--text-node',
      '--border', '--border-lt', '--border-md', '--border-ck',
      '--node-fill', '--node-stroke', '--node-text', '--link-def',
      '--hl-goal', '--hl-task', '--hl-softgoal', '--hl-resource',
      '--hl-hurt', '--hl-help', '--hl-needed-by', '--hl-depends-on',
      '--hl-or', '--hl-xor', '--hl-and', '--hl-part-of',
    ]
    let svgStr = new XMLSerializer().serializeToString(clone)
    for (const v of cssVars) {
      svgStr = svgStr.replaceAll(`var(${v})`, cs.getPropertyValue(v).trim())
    }

    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const bgColor = cs.getPropertyValue('--bg-canvas').trim() || '#f8f8f8'

    const img = new Image()
    img.onload = () => {
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width  = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)

      const mime    = format === 'jpeg' ? 'image/jpeg' : 'image/png'
      const quality = format === 'jpeg' ? 0.92 : undefined
      const a = document.createElement('a')
      a.href     = canvas.toDataURL(mime, quality)
      a.download = `istar-diagram.${format}`
      a.click()
    }
    img.src = url
  },

  clearDiagram: () => set({
    actors: {}, nodes: {}, links: {},
    selectedId: null, selectedType: null, selectedIds: [],
    connectSource: null, pendingLink: null, mode: 'select', focusNodeId: null, focusDeep: false,
  }),

  importDiagram: (json) => {
    try {
      const { actors, nodes, links } = JSON.parse(json)
      set({
        actors: actors || {},
        nodes:  nodes  || {},
        links:  links  || {},
        selectedId: null, selectedType: null, selectedIds: [], mode: 'select',
        connectSource: null, pendingLink: null,
      })
    } catch (e) {
      console.error('Import failed', e)
    }
  },

  loadFromStorage: () => {
    const saved = localStorage.getItem('istar-diagram')
    if (!saved) return
    try {
      const { actors, nodes, links } = JSON.parse(saved)
      const resizedNodes = {}
      for (const [id, node] of Object.entries(nodes || {})) {
        const { width, height } = computeNodeSize(node.label, node.type)
        resizedNodes[id] = { ...node, width, height }
      }
      set({ actors: actors || {}, nodes: resizedNodes, links: links || {} })
    } catch (_) {}
  },
}))

// Auto-save diagram data on every change.
useStore.subscribe((s) => {
  localStorage.setItem('istar-diagram', JSON.stringify({
    actors: s.actors, nodes: s.nodes, links: s.links,
  }))
})

export default useStore
