// Fixed colour combinations for the elements and the actors, chosen from Options → Colors.
// Edit this file to change a combination or add one: each scheme lists, for the light and the dark theme,
// the CSS variables it overrides (anything left out keeps the stylesheet's value in src/index.css).
//   elements: --hl-goal --hl-task --hl-softgoal --hl-resource --hl-subactor   (fill of a highlighted element)
//   actors:   --actor-tint-0 … --actor-tint-11 (one per actor, in order)  --actor-bg --actor-bg-light --actor-bg-deep
// 'default' overrides nothing: it is the current look.

// "Primary tags": elements stay white and only the tag on the bottom edge (GOAL, TASK…) takes the colour when the element is
// highlighted; every link's label is filled with its link colour. --tag-* is the fill, --tag-text-* the text on it.
const ELEMENT_TAGS = {
  goal: ['#ffd500', '#000000'], softgoal: ['#ff8c00', '#000000'], resource: ['#12a150', '#ffffff'], task: ['#0b5fd8', '#ffffff'],
}
// Black or white text on each link colour, whichever reads better (links use the --hl-* colours, which differ per theme)
const LINK_TAG_TEXT = {
  light: { hurt: '#000', break: '#000', help: '#000', make: '#000', 'needed-by': '#fff', 'depends-on': '#fff', or: '#000', xor: '#000', and: '#fff', 'part-of': '#fff' },
  dark:  { hurt: '#fff', break: '#fff', help: '#000', make: '#000', 'needed-by': '#000', 'depends-on': '#000', or: '#000', xor: '#000', and: '#000', 'part-of': '#000' },
}
const LINK_TAG_FILL = { hurt: 'hurt', break: 'hurt', help: 'help', make: 'help', 'needed-by': 'needed-by', 'depends-on': 'depends-on', or: 'or', xor: 'xor', and: 'and', 'part-of': 'part-of' }
// Contribution links keep their full colour but with white text
const WHITE_TAGS = ['help', 'hurt', 'make', 'break']
// The tag colours as CSS variables with the given prefix ('--tag' for the Primary tags set, '--ctag' for the Color tags button).
const tagVars = (prefix, theme) => ({
  ...Object.fromEntries(Object.entries(ELEMENT_TAGS).flatMap(([t, [bg, fg]]) => [[`${prefix}-${t}`, bg], [`${prefix}-text-${t}`, fg]])),
  ...Object.fromEntries(Object.entries(LINK_TAG_FILL).flatMap(([t, c]) =>
    [[`${prefix}-link-${t}`, `var(--hl-${c})`], [`${prefix}-text-link-${t}`, WHITE_TAGS.includes(t) ? '#fff' : LINK_TAG_TEXT[theme][t]]])),
})
// Actor colours, in order (the 9th actor starts over)
const ACTOR_COLORS = ['#6fb4db', '#ea8b77', '#ffce2f', '#a9d049', '#a4a487', '#5f8393', '#82bc79', '#fec988']
const actorColors = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`--actor-tint-${i}`, ACTOR_COLORS[i % ACTOR_COLORS.length]]))
const primaryTags = (theme, extra = {}) => ({
  '--fw': '500',   // medium weight for all the text
  '--hl-goal': 'var(--node-fill)', '--hl-task': 'var(--node-fill)', '--hl-softgoal': 'var(--node-fill)', '--hl-resource': 'var(--node-fill)', '--hl-subactor': 'var(--node-fill)',
  '--node-text-hl': 'var(--node-text)',
  // element tags colour on highlight; link tags stay plain until the Color tags button is pressed
  ...Object.fromEntries(Object.entries(tagVars('--tag', theme)).filter(([v]) => !v.includes('-link-'))),
  // actors: very light grey body; when highlighted, the outline takes the actor's own colour
  '--actor-bg': 'color-mix(in srgb, var(--node-fill) 96%, black)', '--actor-bg-light': 'color-mix(in srgb, var(--node-fill) 96%, black)', '--actor-bg-deep': 'color-mix(in srgb, var(--node-fill) 96%, black)',
  ...actorColors,
  '--actor-tint-pct': '0%', '--actor-stroke-tint': '100%', '--actor-hl-sw': '6', '--actor-bar-tint': '0%', '--actor-dash': 'none', '--actor-dash-legend': 'none',   // unhighlighted actors: a full outline, not dashed
 
  '--node-stroke': '#000', '--hl-stroke': '#000', '--link-line': '#000',
  ...extra,   // black outlines on every element, in both themes
})

export const COLOR_SCHEMES = [
  {
    id: 'default',
    name: { en: 'Current', fr: 'Actuel' },
    light: {},
    dark: {},
  },
  {
    id: 'primary',
    name: { en: 'Primary tags', fr: 'Pastilles primaires' },
    light: primaryTags('light'),
    dark: primaryTags('dark'),
  },
  {
    // the same, and a highlighted actor's body is filled with a light version of its outline colour
    id: 'primary-fill',
    name: { en: 'Primary tags, tinted actors', fr: 'Pastilles primaires, acteurs teintés' },
    light: primaryTags('light', { '--actor-tint-pct': '28%' }),
    dark: primaryTags('dark', { '--actor-tint-pct': '28%' }),
  },
]

// Writes the chosen scheme onto the page as inline CSS variables; every variable an earlier scheme set is removed first.
const applied = new Set()
export function applyColorScheme(id, dark) {
  const style = document.documentElement.style
  applied.forEach(v => style.removeProperty(v))
  applied.clear()
  const scheme = COLOR_SCHEMES.find(s => s.id === id) ?? COLOR_SCHEMES[0]
  for (const [v, c] of Object.entries({ ...tagVars('--ctag', dark ? 'dark' : 'light'), ...(dark ? scheme.dark : scheme.light) })) { style.setProperty(v, c); applied.add(v) }
}

// Swatches shown beside a scheme's name in the menu: the four element fills, then the first actor tints
export function schemeSwatches(scheme, dark) {
  const vars = dark ? scheme.dark : scheme.light
  const fallback = (v) => `var(${v})`
  const els = ['goal', 'task', 'softgoal', 'resource'].map(t => vars[`--tag-${t}`] ?? vars[`--hl-${t}`] ?? fallback(`--hl-${t}`))
  const actors = [0, 1, 2, 3].map(i => vars[`--actor-tint-${i}`] ?? fallback(`--actor-tint-${i}`))
  return { els, actors }
}
