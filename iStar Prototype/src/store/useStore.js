import { create } from 'zustand'
import { GRID, snap, computeNodeSize } from '../utils/grid.js'
import { getUsedOffsets, getNextSlot } from '../utils/ports.js'
import { chainOf, layoutIssues, addsIssue, actorNames } from '../utils/actorTree.js'

const MIN_CLEARANCE = GRID * 2

export const ALL_TYPES = [
  'goal', 'task', 'softgoal', 'resource', 'subactor',
  'depends-on', 'or', 'xor', 'and', 'help', 'hurt', 'make', 'break', 'needed-by', 'part-of',
  'actor',
]

// Bulk filter buttons: first click sets every type on/off and remembers the previous
// selection; clicking the same button again (while still all/none) restores it.
// `resetActorsWhen` is the state (on/off) that also empties the per-actor list:
// "Show all" un-hides every actor, "Clear all" un-highlights every actor.
function bulkSet(types, actorIds, snapshot, on, resetActorsWhen) {
  const resetsActors = resetActorsWhen === on
  const atTarget = (on ? ALL_TYPES.every(t => types.includes(t)) : types.length === 0)
    && (!resetsActors || actorIds.length === 0)
  if (atTarget) return snapshot && { ...snapshot, snapshot: null }
  return {
    types: on ? [...ALL_TYPES] : [],
    actorIds: resetsActors ? [] : actorIds,
    snapshot: { types, actorIds },
  }
}

const toggleIn = (list, id) => list.includes(id) ? list.filter(x => x !== id) : [...list, id]
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

// ── Undo / redo history ────────────────────────────────────────────────────────
// Snapshots of the diagram (nodes, links, actors) taken just before each change; view state
// (filters, selection, theme…) is not part of it. Changes inside a batch (a drag, a label edit)
// collapse into one step.
const HISTORY_LIMIT = 100
const history = { past: [], future: [], batch: 0, batchRecorded: false, restoring: false }
const snapshot = (s) => ({ nodes: s.nodes, links: s.links, actors: s.actors })
// Undo history of the models that aren't open (the open one's is `history`)
const histories = {}

// ── Models (tabs) ──────────────────────────────────────────────────────────────
// The project is a tree of diagrams ("models"). A sub-actor box in one model opens another (its child).
// The open model's data lives in the top-level nodes / links / actors; `models` holds the rest (its own
// entry for the open one is stale until the next switch), so every component works unchanged.
export const ROOT_MODEL = 'main'
const emptyModel = (id, name, parent = null) => ({ id, name, parent, nodes: {}, links: {}, actors: {} })
const withLive = (s) => ({
  ...s.models,
  [s.activeModelId]: { ...s.models[s.activeModelId], nodes: s.nodes, links: s.links, actors: s.actors },
})
const rootOf = (models) => Object.values(models).find(m => !m.parent)?.id ?? Object.keys(models)[0]

// Models reachable from the root through sub-actor boxes, parents first (`depth` = layer). A model whose box
// was deleted stays in memory so that undo can bring it back, but isn't reachable (or saved).
export function reachableModels(models) {
  const out = []
  const walk = (id, depth) => {
    const m = models[id]
    if (!m || out.some(o => o.id === id)) return
    out.push({ id, name: m.name, depth })
    for (const n of Object.values(m.nodes)) if (n.type === 'subactor' && n.linkedModelId) walk(n.linkedModelId, depth + 1)
  }
  walk(rootOf(models), 0)
  return out
}

// Ids from the root down to `id`, for the breadcrumb
export function modelPath(models, id) {
  const path = []
  for (let m = models[id]; m && path.length < 50; m = m.parent && models[m.parent.modelId]) path.unshift(m.id)
  return path
}

const resizeNodes = (nodes) => Object.fromEntries(Object.entries(nodes || {}).map(([id, node]) => {
  const { width, height } = computeNodeSize(node.label, node.type, node.logo ? node.logoAspect ?? 1 : 0)
  return [id, { ...node, width, height }]
}))

// What gets saved / exported: every reachable model, with the open one's live data
function projectData(s) {
  const live = withLive(s)
  const models = {}
  for (const { id } of reachableModels(live)) models[id] = live[id]
  return { version: 2, activeModelId: models[s.activeModelId] ? s.activeModelId : rootOf(models), models }
}

// Turn saved / imported JSON (current or the older single-diagram format) into store state
function loadProject(data) {
  let models, activeModelId
  if (data.models) {
    models = Object.fromEntries(Object.entries(data.models).map(([id, m]) =>
      [id, { ...emptyModel(id, m.name ?? 'Main', m.parent ?? null), ...m, nodes: resizeNodes(m.nodes) }]))
    activeModelId = models[data.activeModelId] ? data.activeModelId : rootOf(models)
  } else {
    models = { [ROOT_MODEL]: { ...emptyModel(ROOT_MODEL, 'Main'), nodes: resizeNodes(data.nodes), links: data.links || {}, actors: data.actors || {} } }
    activeModelId = ROOT_MODEL
  }
  const active = models[activeModelId]
  return { models, activeModelId, nodes: active.nodes, links: active.links, actors: active.actors }
}

const useStore = create((set, get) => ({
  // ── History ──────────────────────────────────────────────────────────────────
  canUndo: false,
  canRedo: false,
  beginBatch: () => { if (history.batch++ === 0) history.batchRecorded = false },
  endBatch:   () => { history.batch = Math.max(0, history.batch - 1) },
  undo: () => restore(history.past, history.future),
  redo: () => restore(history.future, history.past),

  // ── Models (tabs) ────────────────────────────────────────────────────────────
  models: { [ROOT_MODEL]: emptyModel(ROOT_MODEL, 'Main') },
  activeModelId: ROOT_MODEL,

  switchModel: (id) => {
    const s = get()
    if (id === s.activeModelId || !s.models[id]) return
    const models = withLive(s)
    histories[s.activeModelId] = { past: history.past, future: history.future }
    const h = histories[id] ?? { past: [], future: [] }
    history.past = h.past; history.future = h.future
    history.batch = 0; history.batchRecorded = false
    history.restoring = true
    set({
      models, activeModelId: id,
      nodes: models[id].nodes, links: models[id].links, actors: models[id].actors,
      selectedId: null, selectedType: null, selectedIds: [], selectedActorId: null,
      editingActorId: null, editingActorTag: null, focusNodeId: null, focusDeep: false,
      pendingLink: null, connectSource: null, draggingNodeId: null, mode: 'select',
      canUndo: h.past.length > 0, canRedo: h.future.length > 0,
    })
    history.restoring = false
  },

  // The "Open" button of a sub-actor box: opens its diagram, creating it the first time
  openSubactor: (nodeId) => {
    const s = get()
    const node = s.nodes[nodeId]
    if (!node || node.type !== 'subactor') return
    if (node.linkedModelId && s.models[node.linkedModelId]) return get().switchModel(node.linkedModelId)
    const id = crypto.randomUUID()
    set(st => ({
      models: { ...st.models, [id]: emptyModel(id, node.label.trim() || 'Sub-actor', { modelId: st.activeModelId, nodeId }) },
      nodes: { ...st.nodes, [nodeId]: { ...st.nodes[nodeId], linkedModelId: id } },
    }))
    get().switchModel(id)
  },

  // Renaming a tab renames its sub-actor box in the parent too (and the other way round, see updateNode)
  renameModel: (id, rawName) => {
    const name = rawName.trim()
    const s = get()
    if (!name || !s.models[id] || s.models[id].name === name) return
    const parent = s.models[id].parent
    const relabel = (nodes) => {
      const node = nodes[parent.nodeId]
      if (!node) return nodes
      const { width, height } = computeNodeSize(name, node.type, node.logo ? node.logoAspect ?? 1 : 0)
      return { ...nodes, [parent.nodeId]: { ...node, label: name, width, height } }
    }
    history.restoring = true  // not an undo step of its own
    set(st => {
      const models = { ...st.models, [id]: { ...st.models[id], name } }
      if (!parent) return { models }
      if (parent.modelId === st.activeModelId) return { models, nodes: relabel(st.nodes) }
      models[parent.modelId] = { ...models[parent.modelId], nodes: relabel(models[parent.modelId].nodes) }
      return { models }
    })
    history.restoring = false
  },

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
  selectedActorId: null, // set when the selection came from clicking an actor (its nodes aren't outlined)

  // ── Dark mode ────────────────────────────────────────────────────────────────
  darkMode: false,
  // Interface language ('en' | 'fr'): remembered between visits, else the browser's language
  lang: (() => {
    try {
      const saved = localStorage.getItem('istar-lang')
      if (saved === 'en' || saved === 'fr') return saved
    } catch { /* storage unavailable */ }
    return typeof navigator !== 'undefined' && navigator.language?.startsWith('fr') ? 'fr' : 'en'
  })(),
  setLang: (lang) => {
    try { localStorage.setItem('istar-lang', lang) } catch { /* storage unavailable */ }
    set({ lang })
  },
  toggleDarkMode: () => set(s => ({ darkMode: !s.darkMode })),
  legendOpen: true,
  toggleLegend: () => set(s => ({ legendOpen: !s.legendOpen })),
  filterCollapsed: false,  // the left filter panel is minimised to a narrow strip
  toggleFilterCollapsed: () => set(s => ({ filterCollapsed: !s.filterCollapsed })),
  hideTags: false,
  toggleHideTags: () => set(s => ({ hideTags: !s.hideTags })),
  setHideTags: (hide) => set({ hideTags: hide }),
  filterPanelRight: null,  // x of the filter panel's right edge (scrollbar included), so the header can continue its border
  setFilterPanelRight: (x) => set(s => s.filterPanelRight === x ? s : { filterPanelRight: x }),
  filterCardBox: null,   // { left, width } of the Filter card on screen, so the toolbar can centre the logo over it
  setFilterCardBox: (box) => set(s =>
    s.filterCardBox?.left === box.left && s.filterCardBox?.width === box.width ? s : { filterCardBox: box }),

  // ── Filter ───────────────────────────────────────────────────────────────────
  highlightTypes: [],              // types currently highlighted; empty = mode off
  isolateTypes:   [...ALL_TYPES],  // types currently isolated;   empty = mode off
  focusNodeId:    null,            // when set, dims all links not connected to this node
  focusDeep:      false,           // when true, use transitive closure instead of direct links only
  focusDepth:     1,               // layers of relationships shown when focusDeep is off
  highlightSnapshot: null,         // selection before the last "Highlight all"/"Clear all", to restore on a second click
  isolateSnapshot:   null,         // same for "Show all"/"Hide all"
  hiddenActorIds:      [],         // individual actors hidden from the filter panel
  highlightedActorIds: [],         // individual actors highlighted from the filter panel

  // Per-actor toggles work on the *effective* state (the "actor" type row OR the per-actor list),
  // and fold back into the type row when every actor ends up the same, so all controls stay in sync.
  toggleActorHighlight: (id) => set(s => {
    const all = Object.keys(s.actors)
    const typeOn = s.highlightTypes.includes('actor')
    const next = toggleIn(typeOn ? all : s.highlightedActorIds, id)
    const allOn = all.length > 0 && all.every(a => next.includes(a))
    const others = s.highlightTypes.filter(t => t !== 'actor')
    return {
      highlightTypes: allOn ? [...others, 'actor'] : others,
      highlightedActorIds: allOn ? [] : next,
    }
  }),
  toggleActorHidden: (id) => set(s => {
    const all = Object.keys(s.actors)
    const typeVisible = s.isolateTypes.includes('actor')
    const next = toggleIn(typeVisible ? s.hiddenActorIds : all, id)
    const allHidden = all.length > 0 && all.every(a => next.includes(a))
    const others = s.isolateTypes.filter(t => t !== 'actor')
    return {
      isolateTypes: allHidden ? others : [...others, 'actor'],
      hiddenActorIds: allHidden ? [] : next,
    }
  }),

  // Toggling the "actor" type row applies to every actor, so it also resets the per-actor choices
  toggleHighlightType: (type) => set(s => {
    const has = s.highlightTypes.includes(type)
    return {
      highlightTypes: has ? s.highlightTypes.filter(t => t !== type) : [...s.highlightTypes, type],
      ...(type === 'actor' && { highlightedActorIds: [] }),
    }
  }),

  toggleIsolateType: (type) => set(s => {
    const has = s.isolateTypes.includes(type)
    return {
      isolateTypes: has ? s.isolateTypes.filter(t => t !== type) : [...s.isolateTypes, type],
      ...(type === 'actor' && { hiddenActorIds: [] }),
    }
  }),

  filterSelectAll:  () => set({ highlightTypes: [...ALL_TYPES], isolateTypes: [...ALL_TYPES] }),
  filterSelectNone: () => set({ highlightTypes: [], isolateTypes: [] }),
  setAllHighlight: (on) => set(s => {
    const r = bulkSet(s.highlightTypes, s.highlightedActorIds, s.highlightSnapshot, on, false)
    return r ? { highlightTypes: r.types, highlightedActorIds: r.actorIds, highlightSnapshot: r.snapshot } : {}
  }),
  setAllIsolate: (on) => set(s => {
    const r = bulkSet(s.isolateTypes, s.hiddenActorIds, s.isolateSnapshot, on, true)
    return r ? { isolateTypes: r.types, hiddenActorIds: r.actorIds, isolateSnapshot: r.snapshot } : {}
  }),

  setFocusDepth: (n) => set({ focusDepth: Math.max(1, Math.round(n)) }),

  setFocusNode: (id, deep = false) => set(s => {
    const same = s.focusNodeId === id && s.focusDeep === deep
    return { focusNodeId: same ? null : id, focusDeep: same ? false : deep }
  }),

  // ── Mode ─────────────────────────────────────────────────────────────────────
  setMode: (mode) => set({ mode, connectSource: null, pendingLink: null }),
  setDraggingNode: (id) => set({ draggingNodeId: id }),

  // ── Selection ────────────────────────────────────────────────────────────────
  select: (id, type) => set({ selectedId: id, selectedType: type, selectedIds: [], selectedActorId: null }),
  deselect: () => set({ selectedId: null, selectedType: null, selectedIds: [], selectedActorId: null, focusNodeId: null, focusDeep: false,
    editingActorId: null, editingActorTag: null }),

  // A double click on empty canvas: also un-highlights the actors (clicking an actor's tag highlights it)
  deselectAll: () => {
    get().deselect()
    set(s => ({
      highlightTypes: s.highlightTypes.filter(t => t !== 'actor'),
      highlightedActorIds: [],
    }))
  },

  addToSelection: (id) => set(s => {
    const base = (s.selectedIds.length === 0 && s.selectedId && s.selectedType === 'node')
      ? [s.selectedId]
      : s.selectedIds
    const has = base.includes(id)
    const selectedIds = has ? base.filter(x => x !== id) : [...base, id]
    return {
      selectedIds,
      selectedActorId: null,
      selectedId: selectedIds.length ? (has ? selectedIds[selectedIds.length - 1] ?? null : id) : null,
      selectedType: selectedIds.length ? 'node' : null,
    }
  }),

  selectActorNodes: (actorId) => set(s => {
    const ids = Object.values(s.nodes)
      .filter(n => chainOf(n).includes(actorId))
      .map(n => n.id)
    return { selectedIds: ids, selectedId: null, selectedType: null, selectedActorId: actorId }
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
        [id]: { id, type, label: '', actorId: null, x: nx, y: ny, width, height, ...(type === 'subactor' && { linkedModelId: null }) },
      },
      selectedId: id,
      selectedType: 'node',
      selectedIds: [], selectedActorId: null,
      mode: 'select',
    }))
    return id
  },

  updateNode: (id, updates) => set((s) => {
    const node = s.nodes[id]
    const merged = { ...node, ...updates }
    if ('label' in updates || 'logo' in updates) {
      const { width, height } = computeNodeSize(merged.label, node.type, merged.logo ? merged.logoAspect ?? 1 : 0)
      merged.width  = width
      merged.height = height
    }
    // A sub-actor box and the tab it opens share their name
    const name = 'label' in updates && node.linkedModelId && updates.label.trim()
    const models = name && s.models[node.linkedModelId]
      ? { ...s.models, [node.linkedModelId]: { ...s.models[node.linkedModelId], name } } : null
    return { nodes: { ...s.nodes, [id]: merged }, ...(models && { models }) }
  }),

  // Whether these elements can take this actor change ({ actorId?, nestedActorIds? }, or a function giving
  // that for each element): null if fine,
  // otherwise why not — 'parent' (an actor would end up nested in two places, or inside itself) or
  // 'overlap' (an actor's area would run into another's). Adding a far-away element stretches an
  // area, so this has to be checked before assigning. Ids that don't exist yet can be any placeholder;
  // newNames gives their names (tags are sized from them).
  checkActorChange: (nodeIds, patch, newNames = {}) => {
    const { nodes, actors } = get()
    const names = { ...actorNames(actors), ...newNames }
    const next = { ...nodes }
    for (const id of nodeIds) if (next[id]) next[id] = { ...next[id], ...(typeof patch === 'function' ? patch(next[id]) : patch) }
    const after = layoutIssues(next, names)
    if (after.invalid) return 'parent'
    return addsIssue(layoutIssues(nodes, names), after) ? 'overlap' : null
  },

  moveNode: (id, x, y) => set((s) => {
    const node = s.nodes[id]
    const { x: nx, y: ny } = alignSnap(x, y, node.width, node.height, s.nodes, id)
    if (tooClose(nx, ny, node.width, node.height, s.nodes, id)) return {}

    const moved = { ...s.nodes, [id]: { ...node, x: nx, y: ny } }
    const names = actorNames(s.actors)
    if (addsIssue(layoutIssues(s.nodes, names), layoutIssues(moved, names))) return {}

    return { nodes: moved }
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

    const newNodes = { ...s.nodes }
    for (const id of groupIds) newNodes[id] = { ...s.nodes[id], ...proposed[id] }
    const names = actorNames(s.actors)
    if (addsIssue(layoutIssues(s.nodes, names), layoutIssues(newNodes, names))) return {}
    return { nodes: newNodes }
  }),

  deleteNode: (id) => set((s) => {
    const nodes = { ...s.nodes }
    delete nodes[id]
    const links = Object.fromEntries(
      Object.entries(s.links).filter(([, l]) => l.sourceId !== id && l.targetId !== id)
    )
    return { nodes, links, selectedId: null, selectedType: null, selectedIds: [], selectedActorId: null }
  }),

  // ── Actors ───────────────────────────────────────────────────────────────────
  // Creates an actor if the name is new; returns the id either way.
  // Actor edit popup (opened from the actor's name tag)
  editingActorId:  null,
  editingActorTag: null,   // world-space rect of that actor's name tag, for placing the popup
  openActorEditor:  (id) => set({ editingActorId: id }),
  closeActorEditor: () => set({ editingActorId: null, editingActorTag: null }),
  setEditingActorTag: (rect) => set({ editingActorTag: rect }),

  // Rename; using another actor's name merges this actor into that one
  renameActor: (id, rawName) => set(s => {
    const name = rawName.trim()
    const actor = s.actors[id]
    if (!actor || !name || name === actor.name) return {}
    const other = Object.values(s.actors).find(a => a.id !== id && a.name === name)
    if (!other) return { actors: { ...s.actors, [id]: { ...actor, name } } }
    const actors = { ...s.actors }
    delete actors[id]
    const nodes = Object.fromEntries(Object.entries(s.nodes).map(([k, n]) =>
      [k, n.actorId === id ? { ...n, actorId: other.id } : n]))
    const swap = list => [...new Set(list.map(x => x === id ? other.id : x))]
    return {
      actors, nodes,
      hiddenActorIds: swap(s.hiddenActorIds),
      highlightedActorIds: swap(s.highlightedActorIds),
      editingActorId: s.editingActorId === id ? other.id : s.editingActorId,
    }
  }),

  // Remove the actor but keep its elements (they just leave the group)
  ungroupActor: (id) => set(s => {
    const actors = { ...s.actors }
    delete actors[id]
    const nodes = Object.fromEntries(Object.entries(s.nodes).map(([k, n]) =>
      [k, n.actorId === id ? { ...n, actorId: null } : n]))
    return {
      actors, nodes,
      hiddenActorIds: s.hiddenActorIds.filter(x => x !== id),
      highlightedActorIds: s.highlightedActorIds.filter(x => x !== id),
      ...(s.editingActorId === id && { editingActorId: null, editingActorTag: null }),
    }
  }),

  ensureActor: (name, type = 'agent') => {
    const existing = Object.values(get().actors).find((a) => a.name === name)
    if (existing) return existing.id
    const id = crypto.randomUUID()
    set((s) => ({ actors: { ...s.actors, [id]: { id, name, type, level: 1 } } }))
    return id
  },

  // Logo shown next to the actor's name (a small image as a data URL), or null to remove it
  // (logoAspect is its width / height)
  setActorLogo: (id, logo, logoAspect = 1) => set(s => {
    const actor = s.actors[id]
    if (!actor) return {}
    const next = { ...actor }
    delete next.logo
    delete next.logoAspect
    return { actors: { ...s.actors, [id]: logo ? { ...next, logo, logoAspect } : next } }
  }),

  // Tier of the actor: 1 is the highest
  setActorLevel: (id, level) => set(s => {
    const actor = s.actors[id]
    const n = Math.max(1, Math.round(Number(level)) || 1)
    if (!actor || (actor.level ?? 1) === n) return {}
    return { actors: { ...s.actors, [id]: { ...actor, level: n } } }
  }),

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
    const json = JSON.stringify(projectData(get()), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Named after the main project (the root diagram), minus characters files can't hold
    const base = (get().models[ROOT_MODEL]?.name ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim()
    a.download = `${base || 'istar-diagram'}.json`
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
      '--node-fill', '--node-stroke', '--node-text', '--node-text-hl', '--link-def',
      '--hl-goal', '--hl-task', '--hl-softgoal', '--hl-resource',
      '--hl-hurt', '--hl-help', '--hl-needed-by', '--hl-depends-on',
      '--hl-or', '--hl-xor', '--hl-and', '--hl-part-of',
      '--actor-hl-fill', '--actor-hl-stripe',
      '--actor-bg', '--actor-bg-light', '--actor-bg-deep', '--actor-hl-stripe-mix', '--actor-hl-tone',
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
    selectedId: null, selectedType: null, selectedIds: [], selectedActorId: null,
    connectSource: null, pendingLink: null, mode: 'select', focusNodeId: null, focusDeep: false,
  }),

  importDiagram: (json) => {
    try {
      const project = loadProject(JSON.parse(json))
      for (const k of Object.keys(histories)) delete histories[k]
      history.past = []; history.future = []
      history.restoring = true
      set({
        ...project,
        selectedId: null, selectedType: null, selectedIds: [], selectedActorId: null, mode: 'select',
        connectSource: null, pendingLink: null, focusNodeId: null, focusDeep: false,
        editingActorId: null, editingActorTag: null, canUndo: false, canRedo: false,
      })
      history.restoring = false
    } catch (e) {
      console.error('Import failed', e)
    }
  },

  loadFromStorage: () => {
    const saved = localStorage.getItem('istar-diagram')
    if (!saved) return
    try {
      const project = loadProject(JSON.parse(saved))
      history.restoring = true  // loading isn't an undo step
      set(project)
      history.restoring = false
    } catch (_) {}
  },
}))

// Auto-save diagram data on every change.
// Move one snapshot from `from` to the diagram, saving the current diagram onto `to`
function restore(from, to) {
  if (!from.length) return
  const s = useStore.getState()
  to.push(snapshot(s))
  const next = from.pop()
  history.restoring = true
  useStore.setState({
    ...next,
    // Drop references to things that no longer exist after the jump
    ...(s.selectedId && !next.nodes[s.selectedId] && !next.links[s.selectedId] && { selectedId: null, selectedType: null }),
    selectedIds: s.selectedIds.filter(id => next.nodes[id]),
    ...(s.focusNodeId && !next.nodes[s.focusNodeId] && { focusNodeId: null, focusDeep: false }),
    ...(s.editingActorId && !next.actors[s.editingActorId] && { editingActorId: null, editingActorTag: null }),
    pendingLink: null, connectSource: null,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  })
  history.restoring = false
}

// Record the diagram before every change (once per batch)
useStore.subscribe((s, prev) => {
  if (history.restoring) return
  if (s.nodes === prev.nodes && s.links === prev.links && s.actors === prev.actors) return
  if (history.batch && history.batchRecorded) return
  if (history.batch) history.batchRecorded = true
  history.past.push(snapshot(prev))
  if (history.past.length > HISTORY_LIMIT) history.past.shift()
  history.future = []
  useStore.setState({ canUndo: true, canRedo: false })
})

useStore.subscribe((s) => {
  localStorage.setItem('istar-diagram', JSON.stringify(projectData(s)))
})

export default useStore
