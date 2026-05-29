export const GRID = 20
export const SNAP_TO_GRID = false  // set true to revert to grid-snapped placement
export const snap = (v) => SNAP_TO_GRID ? Math.round(v / GRID) * GRID : v

// ── Node sizing constants ─────────────────────────────────────────────────────
export const NODE_MIN_W  = 100   // minimum node width
export const NODE_MAX_W  = 200   // maximum node width — at this point text wraps and height grows
export const NODE_PAD_X    =  8   // horizontal padding each side
export const NODE_PAD_Y    =  6   // vertical padding each side
export const GOAL_PAD_X    = 30   // horizontal padding for goal (pill) nodes
export const GOAL_PAD_Y    = 10   // vertical padding for goal (pill) nodes
export const NODE_LINE_H   = 14   // line height for 11px font (11px + 3px leading)
export const NODE_BADGE_H  = 16   // type badge height (matches link badge: 10px font + 3×2 pad)

let _ctx = null
function getCtx() {
  if (!_ctx) {
    _ctx = document.createElement('canvas').getContext('2d')
    _ctx.font = '11px sans-serif'
  }
  return _ctx
}

// Break `label` into lines that fit within `boxWidth - 2×padX`.
export function wrapLabel(label, boxWidth = NODE_MAX_W, padX = NODE_PAD_X) {
  const ctx  = getCtx()
  const maxW = boxWidth - padX * 2
  const words = (label || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['']

  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width <= maxW) {
      line = test
    } else {
      if (line) lines.push(line)
      line = word   // long single word gets its own line
    }
  }
  if (line) lines.push(line)
  return lines
}

// Returns { width, height } for a node displaying `label`.
// Width grows to fit the full label on one line, capped at NODE_MAX_W.
// Once capped, text wraps and height grows instead.
export function computeNodeSize(label, type = '') {
  const text = (label || '').trim()
  const ctx  = getCtx()
  const padX = (type === 'goal' || type === 'task' || type === 'softgoal') ? GOAL_PAD_X : NODE_PAD_X
  const padY = (type === 'goal' || type === 'task' || type === 'softgoal') ? GOAL_PAD_Y : NODE_PAD_Y

  const singleLineW = text.length ? ctx.measureText(text).width : 0
  const width = Math.min(
    Math.max(Math.ceil((singleLineW + padX * 2) / GRID) * GRID, NODE_MIN_W),
    NODE_MAX_W,
  )

  const lines = wrapLabel(text, width, padX)
  const textAreaH = Math.max(
    Math.ceil((padY * 2 + lines.length * NODE_LINE_H) / GRID) * GRID,
    GRID * 2
  )
  return { width, height: textAreaH + NODE_BADGE_H / 2 }
}
