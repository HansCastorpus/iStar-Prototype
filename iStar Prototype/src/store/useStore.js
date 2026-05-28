import { create } from 'zustand'
import { GRID, snap, computeNodeSize } from '../utils/grid.js'
import { getUsedOffsets, getNextSlot } from '../utils/ports.js'

const MIN_CLEARANCE = GRID * 4
const ACTOR_GAP = 20
const HULL_PAD = 20  // must match Actor.jsx PAD

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

  // ── Mode ─────────────────────────────────────────────────────────────────────
  setMode: (mode) => set({ mode, connectSource: null, pendingLink: null }),
  setDraggingNode: (id) => set({ draggingNodeId: id }),

  // ── Selection ────────────────────────────────────────────────────────────────
  select: (id, type) => set({ selectedId: id, selectedType: type, selectedIds: [] }),
  deselect: () => set({ selectedId: null, selectedType: null, selectedIds: [] }),

  addToSelection: (id) => set(s => {
    const has = s.selectedIds.includes(id)
    const selectedIds = has
      ? s.selectedIds.filter(x => x !== id)
      : [...s.selectedIds, id]
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
    const nx = snap(x), ny = snap(y)
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
    const snappedX = snap(rawX), snappedY = snap(rawY)
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
