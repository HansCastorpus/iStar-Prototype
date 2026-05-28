import { create } from 'zustand'
import { GRID, snap, computeNodeSize } from '../utils/grid.js'
import { getUsedOffsets, getNextSlot } from '../utils/ports.js'

// Minimum gap between any two node bounding boxes = 2 × STUB (80 px).
// Ensures stub regions never overlap regardless of which sides are used.
const MIN_CLEARANCE = GRID * 4

function tooClose(x, y, w, h, nodes, excludeId = null) {
  return Object.values(nodes).some((other) => {
    if (other.id === excludeId) return false
    const gapH = Math.max(other.x - (x + w), x - (other.x + other.width))
    const gapV = Math.max(other.y - (y + h), y - (other.y + other.height))
    return !(gapH >= MIN_CLEARANCE || gapV >= MIN_CLEARANCE)
  })
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

  // ── Mode ─────────────────────────────────────────────────────────────────────
  setMode: (mode) => set({ mode, connectSource: null, pendingLink: null }),

  // ── Selection ────────────────────────────────────────────────────────────────
  select: (id, type) => set({ selectedId: id, selectedType: type }),
  deselect: () => set({ selectedId: null, selectedType: null }),

  // ── Nodes ────────────────────────────────────────────────────────────────────
  addNode: (type, x, y) => {
    const id = crypto.randomUUID()
    const { width, height } = computeNodeSize('')
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
      mode: 'select',
    }))
    return id
  },

  updateNode: (id, updates) => set((s) => {
    const node = s.nodes[id]
    const merged = { ...node, ...updates }
    if ('label' in updates) {
      const { width, height } = computeNodeSize(updates.label)
      merged.width  = width
      merged.height = height
    }
    return { nodes: { ...s.nodes, [id]: merged } }
  }),

  moveNode: (id, x, y) => set((s) => {
    const node = s.nodes[id]
    const nx = snap(x), ny = snap(y)
    if (tooClose(nx, ny, node.width, node.height, s.nodes, id)) return {}
    return { nodes: { ...s.nodes, [id]: { ...node, x: nx, y: ny } } }
  }),

  deleteNode: (id) => set((s) => {
    const nodes = { ...s.nodes }
    delete nodes[id]
    const links = Object.fromEntries(
      Object.entries(s.links).filter(([, l]) => l.sourceId !== id && l.targetId !== id)
    )
    return { nodes, links, selectedId: null, selectedType: null }
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
        },
      },
      pendingLink: null,
      connectSource: null,
    }))
  },

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
        selectedId: null, selectedType: null, mode: 'select',
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
      set({ actors: actors || {}, nodes: nodes || {}, links: links || {} })
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
