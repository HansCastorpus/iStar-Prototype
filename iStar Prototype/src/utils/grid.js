export const GRID = 20
export const SNAP_TO_GRID = false  // set true to revert to grid-snapped placement
export const snap = (v) => SNAP_TO_GRID ? Math.round(v / GRID) * GRID : v

// ── Node sizing constants ─────────────────────────────────────────────────────
export const NODE_MIN_W  = 100   // minimum node width
export const NODE_MAX_W  = 200   // maximum node width — at this point text wraps and height grows
export const NODE_PAD_X    =  8   // horizontal padding each side
export const NODE_PAD_Y    =  6   // vertical padding each side
export const GOAL_PAD_X    = 30   // horizontal padding for task nodes
export const PILL_PAD_X    = 22   // horizontal padding for goal and softgoal (pill) nodes
export const nodePadXFor = (type) =>
  type === 'goal' || type === 'softgoal' ? PILL_PAD_X : type === 'task' ? GOAL_PAD_X : NODE_PAD_X
export const TASK_TIP_X    = 16   // how far the left / right points of a task are cut in (smaller = blunter)
export const GOAL_PAD_Y    = 10   // vertical padding for goal (pill) nodes
export const NODE_FONT     = 13   // font size of the label inside an element
export const NODE_LINE_H   = 16   // line height for the 13px font (13px + 3px leading)
export const NODE_BADGE_H  = 16   // type badge height (matches link badge: 10px font + 3×2 pad)

let _ctx = null
function getCtx() {
  if (!_ctx) {
    _ctx = document.createElement('canvas').getContext('2d')
    _ctx.font = `${NODE_FONT}px sans-serif`
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

// Sub-actor box (an actor that opens its own diagram): name + optional logo on top, an "Open" button below
export const SUB_FONT       = 13
export const SUB_PAD_X      = 14
export const SUB_H          = 72
export const SUB_LOGO_H     = 18    // logo height; its width follows the image, up to SUB_LOGO_MAX_W
export const SUB_LOGO_MAX_W = 54
export const SUB_LOGO_GAP   = 6
export const subLogoWidth = (aspect) => Math.min(SUB_LOGO_H * aspect, SUB_LOGO_MAX_W)

// Width of `text` in a sub-actor box's name font
export function measureSub(text) {
  const ctx = getCtx()
  ctx.font = `600 ${SUB_FONT}px sans-serif`
  const w = ctx.measureText(text).width
  ctx.font = `${NODE_FONT}px sans-serif`
  return w
}

// `text` cut with an ellipsis to fit `maxW` in a sub-actor box's name font
export function fitSubLabel(text, maxW) {
  if (measureSub(text) <= maxW) return text
  let t = text
  while (t.length > 1 && measureSub(t + '…') > maxW) t = t.slice(0, -1)
  return t + '…'
}

// Returns { width, height } for a node displaying `label` (`logoAspect`: width / height of a sub-actor's
// logo, 0 for none).
// Width grows to fit the full label on one line, capped at NODE_MAX_W.
// Once capped, text wraps and height grows instead.
export function computeNodeSize(label, type = '', logoAspect = 0) {
  const text = (label || '').trim()
  const ctx  = getCtx()

  if (type === 'subactor') {
    ctx.font = `600 ${SUB_FONT}px sans-serif`
    const textW = ctx.measureText(text || '[sub-actor]').width
    ctx.font = `${NODE_FONT}px sans-serif`
    const logoW = logoAspect ? SUB_LOGO_GAP + subLogoWidth(logoAspect) : 0
    const width = Math.min(Math.max(Math.ceil((textW + logoW + SUB_PAD_X * 2) / GRID) * GRID, GRID * 7), GRID * 13)
    return { width, height: SUB_H }
  }

  const padX = nodePadXFor(type)
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
