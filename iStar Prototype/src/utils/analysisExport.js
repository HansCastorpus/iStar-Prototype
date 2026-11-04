import { actorLayout, chainOf } from './actorTree.js'

const ELEMENT_TYPES = {
  goal: 'A goal an actor wants to achieve',
  task: 'A task an actor carries out',
  softgoal: 'A quality goal, with no clear-cut satisfaction criterion',
  resource: 'A physical or informational entity',
  subactor: "An actor with its own diagram (see 'opensDiagram')",
}

const LINK_TYPES = {
  'depends-on': 'dependency between elements',
  'needed-by': 'the element at "from" is needed by the element at "to"',
  or: 'OR-decomposition: any one of the sources satisfies the target',
  xor: 'exclusive-OR decomposition: exactly one of the sources satisfies the target',
  and: 'AND-decomposition: all the sources are needed for the target',
  help: 'contribution that helps the target (positive)',
  hurt: 'contribution that hurts the target (negative)',
  make: 'contribution that strongly makes the target (very positive)',
  break: 'contribution that strongly breaks the target (very negative)',
  'part-of': 'the source is a part of the target',
}

// A readable, layout-free description of a project (see projectData in the store) for an AI agent or
// a person analysing the model: names instead of ids, nesting and links spelled out, no coordinates or images.
export function buildAnalysis(project, models) {
  const diagrams = models.map(({ id }) => {
    const m = project.models[id]
    const nodes = Object.values(m.nodes)
    const actors = m.actors
    const actorName = (aid) => actors[aid]?.name ?? null
    const { parentOf } = actorLayout(m.nodes)

    const refOf = {}
    nodes.forEach((n, i) => { refOf[n.id] = `e${n.num ?? i + 1}` })
    const describe = (n) => `${n.type}: ${n.label?.trim() || '(no text)'}`

    return {
      key: id,
      name: m.name,
      parentDiagram: m.parent ? project.models[m.parent.modelId]?.name ?? null : null,
      actors: Object.values(actors).map(a => ({
        name: a.name,
        level: a.level ?? 1,
        nestedIn: actorName(parentOf[a.id]),
        elements: nodes.filter(n => chainOf(n).includes(a.id)).map(n => refOf[n.id]),
      })),
      elements: nodes.map(n => ({
        id: refOf[n.id],
        number: n.num ?? null,
        key: n.id,
        type: n.type,
        text: n.label?.trim() || '',
        actor: actorName(n.actorId),
        nestedActors: (n.nestedActorIds ?? []).map(actorName).filter(Boolean),
        ...(n.type === 'subactor' && { opensDiagram: project.models[n.linkedModelId]?.name ?? null }),
      })),
      links: Object.values(m.links)
        .filter(l => refOf[l.sourceId] && refOf[l.targetId])
        .map(l => ({
          key: l.id,
          type: l.type,
          from: refOf[l.sourceId],
          to: refOf[l.targetId],
          summary: `${describe(m.nodes[l.sourceId])}  —${l.type}→  ${describe(m.nodes[l.targetId])}`,
        })),
    }
  })

  return {
    format: 'istar-analysis',
    about: 'An iStar model. Each diagram lists its actors, the elements inside them and the links between elements. ' +
      'Links are directed: "from" is where the link starts and "to" is where its arrowhead points. ' +
      "An element's `actor` is its main actor; `nestedActors` are actors nested inside it, outermost first. " +
      'Element ids (e1, e2, …) match the `number` shown in the corner of each element in the diagram, and are only meaningful within their own diagram. Layout and images are left out. ' +
      '`key` fields identify diagrams and elements when the file is imported back; import reads only an element\'s `text` and `type` and a link\'s `type`; everything else is ignored.',
    elementTypes: ELEMENT_TYPES,
    linkTypes: LINK_TYPES,
    diagrams,
  }
}

// Read the edits in an analysis file: an element's `text` and `type`, and a link's `type`, matched by `key`.
// Nothing else in the file is read, so nothing can be added, removed, moved or re-routed.
// → { nodes: [{ modelId, nodeId, text?, type? }], links: [{ modelId, linkId, type }], skipped } or { error }
const EDITABLE_ELEMENT_TYPES = ['goal', 'task', 'softgoal', 'resource']  // sub-actor boxes are tied to a diagram
export function readEdits(json, models) {
  let data
  try { data = JSON.parse(json) } catch { return { error: 'notJson' } }
  if (data?.format !== 'istar-analysis' || !Array.isArray(data.diagrams)) return { error: 'notAnalysis' }
  const nodes = [], links = []
  // Why entries were ignored: no `key` in the entry (an older export), a key that matches nothing in this
  // project, a sub-actor box, or a type that isn't allowed
  const skipped = { noKey: 0, unknown: 0, subactor: 0, badType: 0 }
  for (const d of data.diagrams) {
    const model = models[d?.key]
    for (const e of d?.elements ?? []) {
      if (!e?.key) { skipped.noKey++; continue }
      const node = model?.nodes?.[e.key]
      if (!node) { skipped.unknown++; continue }
      if (node.type === 'subactor') { if (e.type !== node.type || (typeof e.text === 'string' && e.text.trim() !== (node.label ?? '').trim())) skipped.subactor++; continue }
      const edit = {}
      if (typeof e.text === 'string') {
        const text = e.text.replace(/\s+/g, ' ').trim()
        if (text !== (node.label ?? '').trim()) edit.text = text
      }
      if (e.type !== node.type) {
        if (EDITABLE_ELEMENT_TYPES.includes(e.type)) edit.type = e.type
        else skipped.badType++
      }
      if (Object.keys(edit).length) nodes.push({ modelId: d.key, nodeId: node.id, ...edit })
    }
    for (const l of d?.links ?? []) {
      if (!l?.key) { skipped.noKey++; continue }
      const link = model?.links?.[l.key]
      if (!link) { skipped.unknown++; continue }
      if (l.type === link.type) continue
      if (Object.hasOwn(LINK_TYPES, l.type)) links.push({ modelId: d.key, linkId: link.id, type: l.type })
      else skipped.badType++
    }
  }
  return { nodes, links, skipped }
}
