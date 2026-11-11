import { LINK_TYPES, typesFor } from './language.js'
import { chainOf } from './actorTree.js'

// Which links the iStar 2.0 language guide (Dalpiaz, Franch & Horkoff, 2016, Table 1 and section 8) allows between two elements,
// by the element types at the start (source) and the arrowhead (target) of the link:
//
//   from \ to   goal         softgoal       task         resource
//   goal        refinement   contribution   refinement   –
//   softgoal    qualification contribution  qualification qualification
//   task        refinement   contribution   refinement   –
//   resource    –            contribution   needed-by    –
//
// Refinement is the and / or links (xor, the exclusive or the tool adds, is treated as one of them); contribution is
// make / help / hurt / break; the guide has no qualification link in the tool, so softgoal → goal / task / resource has none.
// A dependency (depends-on) may have an element of any type as its dependum. part-of is not in the guide at all; it is only
// offered between two elements of the same type, so it can still be used in this mode.
// Two more rules from the guide: refinement, contribution and needed-by only join elements wanted by the same actor, and a
// dependency joins two different actors (both only checked when both elements have an actor).
const REFINEMENT = ['and', 'or', 'xor']
const CONTRIBUTION = ['help', 'hurt', 'make', 'break']

const TYPE_RULES = {
  goal:     { goal: REFINEMENT, softgoal: CONTRIBUTION, task: REFINEMENT },
  softgoal: { softgoal: CONTRIBUTION },
  task:     { goal: REFINEMENT, softgoal: CONTRIBUTION, task: REFINEMENT },
  resource: { softgoal: CONTRIBUTION, task: ['needed-by'] },
}
const SAME_ACTOR_ONLY = new Set([...REFINEMENT, ...CONTRIBUTION, 'needed-by'])

// The actor that wants an element: the innermost one it belongs to (null for an element outside every actor)
const ownerOf = (node) => chainOf(node).at(-1) ?? null

// The link types allowed from `source` to `target` (element objects), in the tool's usual order
export function allowedLinkTypes(source, target, language = 'istar2') {
  const sameOwner = ownerOf(source) && ownerOf(target) ? ownerOf(source) === ownerOf(target) : null  // null: not known
  const byType = TYPE_RULES[source.type]?.[target.type] ?? []
  return typesFor(language, LINK_TYPES).filter(type => {
    if (type === 'depends-on') return sameOwner !== true
    if (type === 'part-of') return source.type === target.type
    if (!byType.includes(type)) return false
    return !SAME_ACTOR_ONLY.has(type) || sameOwner !== false
  })
}
