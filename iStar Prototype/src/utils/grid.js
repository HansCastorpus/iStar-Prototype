export const GRID = 20

export const snap = (v) => Math.round(v / GRID) * GRID

// Size a node to fit its label text at a 5:3 (width:height) ratio, grid-snapped.
let _ctx = null
export function computeNodeSize(label) {
  if (!_ctx) _ctx = document.createElement('canvas').getContext('2d')
  _ctx.font = '11px monospace'
  const textW = _ctx.measureText((label || '').trim() || '...').width
  const width  = Math.max(Math.ceil((textW + 24) / GRID) * GRID, GRID * 5)  // min 100px
  const height = Math.max(Math.ceil((width * 3 / 5) / GRID) * GRID, GRID * 2) // 5:3, min 40px
  return { width, height }
}
