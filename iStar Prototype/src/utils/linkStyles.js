// How a highlighted link looks on the graph, by link type: colour, thickness, and dashes where the link is drawn dashed.
export const HIGHLIGHT_STYLES = {
  hurt:         { color: 'var(--hl-hurt)',       sw: 8 },
  break:        { color: 'var(--hl-hurt)',        sw: 8 },
  help:         { color: 'var(--hl-help)',        sw: 8 },
  make:         { color: 'var(--hl-help)',        sw: 8 },
  'needed-by':  { color: 'var(--hl-needed-by)',  sw: 6, dash: '8 4' },
  'depends-on': { color: 'var(--hl-depends-on)', sw: 6 },
  'or':         { color: 'var(--hl-or)',          sw: 6 },
  'xor':        { color: 'var(--hl-xor)',         sw: 6 },
  'and':        { color: 'var(--hl-and)',         sw: 6 },
  'part-of':    { color: 'var(--hl-part-of)',     sw: 6 },
}
