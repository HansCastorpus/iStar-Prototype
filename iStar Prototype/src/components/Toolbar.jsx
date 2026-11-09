import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { flushSync } from 'react-dom'
import useStore from '../store/useStore.js'
import { useT, LANGS, STRINGS } from '../i18n.js'
import SharePopup from './SharePopup.jsx'
import { shareLink } from '../utils/share.js'
import { typesFor, LINK_TYPES } from '../utils/language.js'

const MODES = [
  { id: 'select',         label: 'toolbar.select' },
  { id: 'add-goal',       label: 'toolbar.addGoal' },
  { id: 'add-task',       label: 'toolbar.addTask' },
  { id: 'add-softgoal',   label: 'toolbar.addSoftgoal' },
  { id: 'add-resource',   label: 'toolbar.addResource' },
  { id: 'add-subactor',   label: 'toolbar.addSubactor' },
]

const iconStyle = { display: 'inline', verticalAlign: 'middle', margin: '0 2px' }

// stroke: outline colour, e.g. the blue / green selection outlines
function GoalShape({ stroke = 'var(--node-stroke)', strokeWidth = 1 }) {
  return (
    <svg width="24" height="14" viewBox="0 0 24 14" style={iconStyle}>
      <rect x="1" y="1" width="22" height="12" rx="6" fill="var(--node-fill)" stroke={stroke} strokeWidth={strokeWidth}/>
    </svg>
  )
}

const BlueShape  = () => <GoalShape stroke="#0070f3" strokeWidth={2} />
const GreenShape = () => <GoalShape stroke="#16a34a" strokeWidth={2} />

function ArrowIcon({ dashed = false, color = 'var(--node-stroke)' }) {
  return (
    <svg width="24" height="14" viewBox="0 0 24 14" style={iconStyle}>
      <line x1="2" y1="7" x2="17" y2="7" stroke={color} strokeWidth="1.2" strokeDasharray={dashed ? '3 2' : undefined}/>
      <polygon points="17,4 22,7 17,10" fill={color}/>
    </svg>
  )
}

function TagIcon() {
  const t = useT()
  return (
    <svg width="32" height="14" viewBox="0 0 32 14" style={iconStyle}>
      <rect x="0.5" y="0.5" width="31" height="13" rx="6.5" fill="var(--node-fill)" stroke="var(--node-stroke)" strokeWidth="1"/>
      <text x="16" y="7.5" textAnchor="middle" dominantBaseline="middle" fontSize="7" fontFamily="sans-serif" fill="var(--node-text)">{t('type.and').toUpperCase()}</text>
    </svg>
  )
}

function ActorTagIcon() {
  return (
    <svg width="30" height="14" viewBox="0 0 30 14" style={iconStyle}>
      <rect x="0.5" y="1.5" width="29" height="11" rx="4" fill="var(--node-fill)" stroke="var(--node-stroke)" strokeWidth="1"/>
      <line x1="7" y1="7" x2="23" y2="7" stroke="var(--node-text)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// "iStar" goal → link → "Builder" resource, drawn like the diagram itself.
// Drawn as an AND link, mirroring Link.jsx: the arrowhead (ARROW_H 8, ARROW_HW 5) touches the
// target's edge, a crossbar (2 × ICON_R long) sits ICON_GAP behind it, and the line ends at the bar.
const LOGO_ARROW_H = 8, LOGO_ARROW_HW = 5
const LOGO_ICON_GAP = 4    // space between the AND bar and the arrowhead's base
const LOGO_ICON_R = 5      // half the AND bar's length
const LOGO_LINE_W = 2

// Scales up to fill its container (width: 100%), but no further than LOGO_MAX_SCALE times its drawn size
const LOGO_MAX_SCALE = 1.8
export function Logo() {
  const H = 24, MID = H / 2
  const goal = { x: 1, w: 52 }
  const res  = { x: 84, w: 62 }
  const tip = res.x, barX = tip - LOGO_ARROW_H - LOGO_ICON_GAP
  const text = { fontSize: 12, fontFamily: 'Roboto, sans-serif', fill: 'var(--node-text)',
    textAnchor: 'middle', dominantBaseline: 'central' }
  return (
    <svg viewBox={`0 0 ${res.x + res.w + 1} ${H}`}
      role="img" aria-label="iStar Builder"
      style={{ display: 'block', width: '100%', maxWidth: (res.x + res.w + 1) * LOGO_MAX_SCALE, height: 'auto' }}>
      <rect x={goal.x} y={1} width={goal.w} height={H - 2} rx={(H - 2) / 2}
        fill="var(--node-fill)" stroke="var(--node-stroke)" strokeWidth={1} />
      <text x={goal.x + goal.w / 2} y={MID} {...text}>iStar</text>

      <line x1={goal.x + goal.w} y1={MID} x2={barX} y2={MID} stroke="var(--link-def)" strokeWidth={LOGO_LINE_W} />
      <line x1={barX} y1={MID - LOGO_ICON_R} x2={barX} y2={MID + LOGO_ICON_R}
        stroke="var(--link-def)" strokeWidth={LOGO_LINE_W} strokeLinecap="round" />
      <polygon fill="var(--link-def)"
        points={`${tip},${MID} ${tip - LOGO_ARROW_H},${MID - LOGO_ARROW_HW} ${tip - LOGO_ARROW_H},${MID + LOGO_ARROW_HW}`} />

      <rect x={res.x} y={1} width={res.w} height={H - 2}
        fill="var(--node-fill)" stroke="var(--node-stroke)" strokeWidth={1} />
      <text x={res.x + res.w / 2} y={MID} {...text}>Builder</text>
    </svg>
  )
}

// Divider between the header's button groups, drawn as an OR link (geometry from Link.jsx):
// line → hollow circle (ICON_R) → ICON_GAP → floating arrowhead. The line stretches, so the dividers
// take up whatever width the header has left over, while the buttons keep their spacing.
// `space`: side margin; it adds to the parent's flex gap to make 10px each side (toolbar gap 8 → 2).
const CONNECTOR_MIN_W = 34
const CONNECTOR_LINE_W = 1   // thinner than the logo's lines
function OrConnector({ space = 2 }) {
  const H = 14, MID = H / 2
  const R = LOGO_ICON_R
  const W = R + LOGO_ARROW_H + LOGO_ICON_GAP + R   // circle + gap + arrowhead (the line is the stretchy part)
  const cx = R, tip = W
  return (
    <div aria-hidden style={{ flex: `1 1 ${CONNECTOR_MIN_W}px`, minWidth: CONNECTOR_MIN_W, display: 'flex', alignItems: 'center', margin: `0 ${space}px` }}>
      <div style={{ flex: 1, height: CONNECTOR_LINE_W, background: 'var(--link-def)' }} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}>
        <circle cx={cx} cy={MID} r={LOGO_ICON_R - CONNECTOR_LINE_W / 2}
          fill="var(--node-fill)" stroke="var(--link-def)" strokeWidth={CONNECTOR_LINE_W} />
        <polygon fill="var(--link-def)"
          points={`${tip},${MID} ${tip - LOGO_ARROW_H},${MID - LOGO_ARROW_HW} ${tip - LOGO_ARROW_H},${MID + LOGO_ARROW_HW}`} />
      </svg>
    </div>
  )
}

const HELP_COL_W = 420     // width per column of the help popup
const HELP_MAX_COLS = 3
const HELP_MARGIN = 12     // space kept between the popup and the window edges
const HELP_GAP = 2         // space between the bottom of the header and the popup

const B = ({ children }) => <strong>{children}</strong>

// Help content per language (kept here rather than in i18n.js because it embeds icons)
const HELP = {
en: [
  {
    title: 'Building the diagram',
    steps: [
      <>Add intentional elements <GoalShape /> with the <B>+</B> buttons, then click on the canvas to place them.</>,
      <>Click an element to select it: it gets a <B>blue</B> outline <BlueShape /> and a popup opens to edit its type and actor. <B>Double-click</B> an element to type its text right on it; <B>Enter</B> confirms, <B>Esc</B> cancels.</>,
      <>Click the selected element again to deselect it.</>,
      <>The popup places itself so it covers as little of the diagram as possible. Drag it by its top bar, or use <B>hide</B> / <B>show</B> to minimise it.</>,
      <><B>Ctrl/⌘+Z</B> undoes your last change and <B>Shift+Ctrl/⌘+Z</B> redoes it, or use <B>↶</B> / <B>↷</B> in the header. A whole drag counts as one step.</>,
    ],
  },
  {
    title: 'Linking two elements',
    steps: [
      <>Click the first element. Its <B>blue</B> outline <BlueShape /> marks the <B>source</B> of the link.</>,
      <>Click the second element. Its <B>green</B> outline <GreenShape /> marks the <B>target</B>, and a dashed <B>ghost link</B> <ArrowIcon dashed color="#16a34a" /> previews the route.</>,
      <>Pick the link type from the list that appears. The link <ArrowIcon /> points from blue to green. Choose <B>cancel</B> to abort.</>,
      <>Click a link <ArrowIcon /> to change its type, reverse its direction, or delete it.</>,
      <>Links follow an octilinear grid. You can slide the information tags <TagIcon /> along a link to improve readability.</>,
      <>If a long link struggles to find a clean path, click it and enable an <B>outer route</B> from the popup. A side (left, right, top, bottom) controls which way it goes around the diagram.</>,
    ],
  },
  {
    title: 'Actors',
    steps: [
      <>Type an actor name in an element's popup to group it into that actor. Elements sharing a name share a boundary.</>,
      <>Click an actor's name tag <ActorTagIcon /> to highlight it; click it again to clear the highlight.</>,
      <>Drag the name tag or the boundary to move the actor with all its elements.</>,
    ],
  },
  {
    title: 'Filter panel (left)',
    steps: [
      <><B>Hide</B> and <B>Highlight</B> each element, link and actor type with the checkboxes.</>,
      <><B>Show all</B> / <B>Hide all</B> and <B>Highlight all</B> / <B>Clear all</B> change every type at once. Click the same button again to restore your previous selection.</>,
      <><B>Show tags</B> / <B>Hide tags</B> toggles the tags on links and elements.</>,
      <><B>Show legend</B> displays what each element and link looks like next to its checkboxes.</>,
      <><B>Each actor</B> opens a side panel to hide or highlight actors one by one.</>,
    ],
  },
  {
    title: 'Dependencies',
    steps: [
      <>Select an element, then <B>Highlight relationships</B> to see the elements linked into it. Use <B>Layers of dependency</B> <B>− / +</B> to reach further back, one layer at a time.</>,
      <><B>Highlight all dependencies</B> shows its whole upstream chain. Everything else is dimmed; click the button again to clear.</>,
    ],
  },
],
fr: [
  {
    title: 'Construire le diagramme',
    steps: [
      <>Ajoutez des éléments intentionnels <GoalShape /> avec les boutons <B>+</B>, puis cliquez sur le canevas pour les placer.</>,
      <>Cliquez sur un élément pour le sélectionner : il prend un contour <B>bleu</B> <BlueShape /> et une fenêtre s'ouvre pour modifier son libellé, son type et son acteur. Appuyez sur <B>Entrée</B> pour valider la saisie.</>,
      <>Cliquez à nouveau sur l'élément sélectionné pour le désélectionner.</>,
      <>La fenêtre se place d'elle-même pour couvrir le moins possible le diagramme. Déplacez-la par sa barre du haut, ou utilisez <B>masquer</B> / <B>afficher</B> pour la réduire.</>,
      <><B>Ctrl/⌘+Z</B> annule votre dernière modification et <B>Maj+Ctrl/⌘+Z</B> la rétablit, ou utilisez <B>↶</B> / <B>↷</B> dans l'en-tête. Un déplacement complet compte pour une seule étape.</>,
    ],
  },
  {
    title: 'Relier deux éléments',
    steps: [
      <>Cliquez sur le premier élément. Son contour <B>bleu</B> <BlueShape /> indique la <B>source</B> du lien.</>,
      <>Cliquez sur le second élément. Son contour <B>vert</B> <GreenShape /> indique la <B>cible</B>, et un <B>lien fantôme</B> en pointillés <ArrowIcon dashed color="#16a34a" /> prévisualise le tracé.</>,
      <>Choisissez le type de lien dans la liste qui apparaît. Le lien <ArrowIcon /> va du bleu vers le vert. Choisissez <B>annuler</B> pour abandonner.</>,
      <>Cliquez sur un lien <ArrowIcon /> pour changer son type, inverser son sens ou le supprimer.</>,
      <>Les liens suivent une grille octilinéaire. Vous pouvez faire glisser les étiquettes <TagIcon /> le long d'un lien pour améliorer la lisibilité.</>,
      <>Si un long lien peine à trouver un tracé propre, cliquez dessus et activez le <B>tracé extérieur</B> dans la fenêtre. Un côté (gauche, droite, haut, bas) choisit par où il contourne le diagramme.</>,
    ],
  },
  {
    title: 'Acteurs',
    steps: [
      <>Saisissez un nom d'acteur dans la fenêtre d'un élément pour le regrouper dans cet acteur. Les éléments qui partagent un nom partagent une frontière.</>,
      <>Cliquez sur l'étiquette du nom d'un acteur <ActorTagIcon /> pour le surligner ; cliquez à nouveau pour retirer le surlignage.</>,
      <>Faites glisser l'étiquette ou la frontière pour déplacer l'acteur avec tous ses éléments.</>,
    ],
  },
  {
    title: 'Panneau de filtres (gauche)',
    steps: [
      <><B>Masquez</B> et <B>surlignez</B> chaque type d'élément, de lien et d'acteur avec les cases à cocher.</>,
      <><B>Tout afficher</B> / <B>Tout masquer</B> et <B>Tout surligner</B> / <B>Tout effacer</B> agissent sur tous les types à la fois. Cliquez à nouveau sur le même bouton pour retrouver votre sélection précédente.</>,
      <><B>Afficher tags</B> / <B>Masquer tags</B> affiche ou masque les étiquettes des liens et des éléments.</>,
      <><B>Afficher la légende</B> montre l'apparence de chaque élément et lien à côté de ses cases.</>,
      <><B>Chaque acteur</B> ouvre un panneau latéral pour masquer ou surligner les acteurs un par un.</>,
    ],
  },
  {
    title: 'Dépendances',
    steps: [
      <>Sélectionnez un élément, puis <B>Surligner les relations</B> pour voir les éléments qui y sont reliés. Utilisez <B>Niveaux de dépendance</B> <B>− / +</B> pour remonter plus loin, un niveau à la fois.</>,
      <><B>Surligner toutes les dépendances</B> montre toute sa chaîne en amont. Le reste est estompé ; cliquez à nouveau sur le bouton pour effacer.</>,
    ],
  },
],
}

// Drop-down menu: a button that opens a panel of items below it. Closes on outside click, Esc, or
// after an item is chosen (an item can keep it open with `keepOpen`).
function Menu({ label, active = false, align = 'left', width = 220, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const panelRef = useRef(null)
  const [shift, setShift] = useState(0)  // keeps the panel inside the window
  useLayoutEffect(() => {
    if (!open || !panelRef.current) return
    // Measured before the browser paints, so the panel opens in its final position
    const fit = () => {
      const el = panelRef.current
      if (!el) return
      const applied = el.style.transform
      el.style.transform = 'none'  // measure from the unshifted position
      const r = el.getBoundingClientRect()
      const m = 8
      el.style.transform = applied
      setShift(r.right > window.innerWidth - m ? window.innerWidth - m - r.right : r.left < m ? m - r.left : 0)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [open])
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    // Capture phase: the canvas stops mouse events from bubbling, so a bubbling listener never sees clicks on it
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu" aria-expanded={open}
        className="tbtn" data-on={active || open}
        style={{
          padding: '5px 14px', cursor: 'pointer', fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Roboto, sans-serif',
          display: 'flex', alignItems: 'center', gap: 8,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        <svg width="9" height="6" viewBox="0 0 9 6" aria-hidden style={{ flexShrink: 0 }}>
          <path d="M1,1 L4.5,5 L8,1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div ref={panelRef} role="menu" style={{
          position: 'absolute', top: 'calc(100% + 4px)', [align]: 0, width, zIndex: 300,
          maxWidth: 'calc(100vw - 16px)', transform: `translateX(${shift}px)`,
          background: 'var(--bg-popup)', border: '1px solid var(--border-md)', borderRadius: 'var(--radius)', padding: '4px 0',
          boxShadow: '0 4px 14px rgba(0,0,0,0.15)', fontFamily: 'Roboto, sans-serif', fontSize: 13,
        }}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}

// One row of a menu. checked: shows a tick (the current choice); current: bold, no tick; faded: dimmed (an unused choice); danger: red
function MenuItem({ children, onClick, checked, danger, disabled, desc, current, faded }) {
  return (
    <button role="menuitem" className="menu-item" onClick={onClick} disabled={disabled} style={{
      display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
      background: 'none', border: 'none', padding: '6px 14px 6px 10px', gap: 6,
      fontFamily: 'Roboto, sans-serif', fontSize: 13, cursor: disabled ? 'default' : 'pointer',
      color: danger ? '#c00' : disabled ? 'var(--text-3)' : 'var(--text-1)',
      opacity: faded ? 0.3 : 1,
      borderRadius: 0,
    }}>
      <span aria-hidden style={{ width: 12, flexShrink: 0, fontSize: 12, alignSelf: desc ? 'flex-start' : 'center', marginTop: desc ? 2 : 0 }}>{checked ? '✓' : ''}</span>
      {desc
        ? <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontWeight: checked || current ? 'bold' : 'normal' }}>{children}</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.3 }}>{desc}</span>
          </span>
        : children}
    </button>
  )
}

const MenuLabel = ({ children }) => (
  <div className="menu-label" style={{ margin: '8px 0 0', padding: '0 14px 4px', borderBottom: '1px solid var(--text-1)', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-1)', fontFamily: 'Roboto, sans-serif' }}>{children}</div>
)
const MenuSub = ({ children }) => (
  <div className="menu-sub" style={{ padding: '5px 14px', borderTop: '1px solid var(--border-lt)', borderBottom: '1px solid var(--border-lt)', fontSize: 11, letterSpacing: 0.4, color: 'var(--text-3)', fontFamily: 'Roboto, sans-serif' }}>{children}</div>
)
const Hint = ({ children }) => <span style={{ marginLeft: 'auto', paddingLeft: 12, fontSize: 11, color: 'var(--text-2)' }}>{children}</span>
const MenuDivider = () => <div style={{ height: 4 }} />

export default function Toolbar({ inset = 0 }) {
  const { mode, setMode, exportDiagram, exportInboxTemplate, importEdits, importDiagram, clearDiagram, exportAsImage, darkMode, toggleDarkMode } = useStore()
  const lang = useStore(s => s.lang)
  const setLang = useStore(s => s.setLang)
  const viewer = useStore(s => s.viewer)  // opened from a share link: only the menus that make sense for looking at a graph
  const diagramName = useStore(s => s.models[s.activeModelId]?.name ?? '')  // the viewer shows it here, at the right of the header
  const language = useStore(s => s.language)
  const setLanguage = useStore(s => s.setLanguage)
  const t = useT()
  const canUndo = useStore(s => s.canUndo)
  const canRedo = useStore(s => s.canRedo)
  const undo = useStore(s => s.undo)
  const redo = useStore(s => s.redo)
  const inboxOpen = useStore(s => s.inboxOpen)
  const setInboxOpen = useStore(s => s.setInboxOpen)
  const waiting = useStore(s => s.inbox.filter(i => !i.placedNodeId).length)
  const showGrid = useStore(s => s.showGrid)
  const showClearance = useStore(s => s.showClearance)
  const setViewAid = useStore(s => s.setViewAid)
  const fileRef  = useRef(null)
  const helpRef  = useRef(null)
  const timerRef = useRef(null)
  const [armed,    setArmed]    = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // The help popup never scrolls: it widens into more columns until it fits the window height,
  // and shifts left if the wider popup would run off the right edge.
  const [helpEl, setHelpEl] = useState(null)
  const [helpCols, setHelpCols] = useState(1)
  const [helpShift, setHelpShift] = useState(0)
  const [helpTop, setHelpTop] = useState(null)  // offset that puts the popup HELP_GAP below the header
  useEffect(() => {
    if (!helpEl) return
    const fit = () => flushSync(() => {
      const anchor = helpEl.parentElement.getBoundingClientRect()
      const top = helpEl.closest('[data-toolbar]').getBoundingClientRect().bottom + HELP_GAP
      setHelpTop(top - anchor.top)
      if (helpEl.scrollHeight > window.innerHeight - top - HELP_MARGIN)
        setHelpCols(c => Math.min(c + 1, HELP_MAX_COLS))
      const anchorLeft = anchor.left
      setHelpShift(Math.min(0, window.innerWidth - HELP_MARGIN - (anchorLeft + helpEl.offsetWidth)))
    })
    const ro = new ResizeObserver(fit)  // re-runs whenever the popup's size changes (incl. new columns)
    ro.observe(helpEl)
    const onResize = () => setHelpCols(1)  // start over; it widens again only if needed
    window.addEventListener('resize', onResize)
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize) }
  }, [helpEl])

  const armClear = () => {
    setArmed(true)
    timerRef.current = setTimeout(() => setArmed(false), 4000)
  }
  const cancelClear = () => { clearTimeout(timerRef.current); setArmed(false) }
  const confirmClear = () => { clearTimeout(timerRef.current); setArmed(false); clearDiagram() }

  useEffect(() => () => clearTimeout(timerRef.current), [])

  useEffect(() => {
    if (!helpOpen) return
    const handler = (e) => {
      if (helpRef.current && !helpRef.current.contains(e.target)) setHelpOpen(false)
    }
    document.addEventListener('pointerdown', handler, true)  // capture: the canvas stops events from bubbling
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [helpOpen])

  const textRef = useRef(null)
  const handleImportText = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const r = importEdits(ev.target.result)
      if (r.error) return alert(t(r.error === 'notJson' ? 'toolbar.importEditsBadFile' : 'toolbar.importEditsNotAnalysis'))
      const reasons = Object.entries(r.skipped).filter(([, n]) => n > 0)
        .map(([why, n]) => `• ${t(`toolbar.importEditsSkip.${why}`, { n })}`)
      alert([t('toolbar.importEditsDone', { n: r.updated }), ...(reasons.length ? [t('toolbar.importEditsIgnored'), ...reasons] : [])].join('\n'))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Publishing a read-only link happens in a popup, behind a password (see SharePopup.jsx)
  const [sharing, setSharing] = useState(false)
  const share = useStore(s => s.share)  // where this project was published, if it was
  // A direct link to the viewer: the published graph, in a new tab. Not published yet → the sharing popup opens instead.
  const openViewer = () => {
    if (share) window.open(shareLink(share.user, share.gistId), '_blank', 'noopener')
    else setSharing(true)
  }

  const contribRef = useRef(null)
  const linkTypeList = () => typesFor(language, LINK_TYPES).map(id => ({ id, label: t(`type.${id}`) }))
  // Link type names in every language (and the ids) → id, so a sheet filled in under another language still reads
  const linkLabelMap = () => {
    const map = {}
    for (const id of LINK_TYPES) {
      map[id] = id
      for (const strings of Object.values(STRINGS)) if (strings[`type.${id}`]) map[strings[`type.${id}`].toLowerCase()] = id
    }
    return map
  }
  const handleImportContrib = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    const { error, plan } = await useStore.getState().readInboxSheet(await file.arrayBuffer(), linkLabelMap())
    if (error) return alert(t(error === 'notJson' ? 'toolbar.importSheetBadFile' : 'toolbar.contribNotOurs'))
    let takeConflicts = false
    if (plan.conflicts.length) {
      const list = plan.conflicts.slice(0, 8).map(c => `• ${t('toolbar.contribRow', { n: c.line })} — ${c.field}`).join('\n')
      takeConflicts = !confirm(t('toolbar.contribConflicts', { n: plan.conflicts.length, list }))
    }
    const r = useStore.getState().applyInboxPlan(plan, takeConflicts)
    const lines = [t('toolbar.contribDone', { a: r.added, u: r.updated })]
    if (plan.errors.length) lines.push(t('toolbar.importEditsIgnored'), ...plan.errors.map(x => `• ${t('toolbar.contribRow', { n: x.line })}: ${t(`toolbar.contribErr.${x.reason}`)}`))
    if (plan.removed) lines.push(t('toolbar.contribRemoved', { n: plan.removed }))
    if (plan.dropped) lines.push(t('toolbar.contribDropped', { n: plan.dropped }))
    if (plan.unlisted.length) lines.push(t('toolbar.contribUnlisted', { names: plan.unlisted.join(', ') }))
    alert(lines.join('\n'))
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => importDiagram(ev.target.result)
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div data-toolbar style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      padding: 2, paddingLeft: 2 + inset,
      background: 'var(--bg-header)',
      flexShrink: 0,
    }}>
      <Menu label={t('toolbar.file')} width={280}>
        {close => <>
          {!viewer && <>
          <MenuLabel>{t('menu.language')}</MenuLabel>
          <MenuItem current={language === 'istar2'} faded={language !== 'istar2'} desc={t('menu.langIstar2Desc')} onClick={() => { setLanguage('istar2'); close() }}>{t('menu.langIstar2')}</MenuItem>
          <MenuItem current={language === 'custom'} faded={language !== 'custom'} desc={t('menu.langCustomDesc')} onClick={() => { setLanguage('custom'); close() }}>{t('menu.langCustom')}</MenuItem>
          <MenuDivider />
          </>}
          <MenuLabel>{t('toolbar.export')}</MenuLabel>
          <MenuSub>{t('menu.groupBackup')}</MenuSub>
          <MenuItem onClick={() => { exportDiagram(); close() }}>{t('menu.project')}</MenuItem>
          <MenuItem onClick={() => { exportAsImage('png'); close() }}>{t('menu.png')}</MenuItem>
          <MenuItem onClick={() => { exportAsImage('jpeg'); close() }}>{t('menu.jpeg')}</MenuItem>
          {!viewer && <>
          <MenuSub>{t('menu.groupContrib')}</MenuSub>
          <MenuItem onClick={() => { exportInboxTemplate(linkTypeList(), true); close() }}>
            <span title={t('menu.contribBlankHint')}>{t('menu.contribBlank')}</span>
          </MenuItem>
          <MenuItem onClick={() => { exportInboxTemplate(linkTypeList()); close() }}>
            <span title={t('menu.contribExportHint')}>{t('menu.contribExport')}</span>
          </MenuItem>
          </>}
          {!viewer && <>
          <MenuDivider />
          <MenuLabel>{t('toolbar.import')}</MenuLabel>
          <MenuSub>{t('menu.groupBackup')}</MenuSub>
          <MenuItem onClick={() => { fileRef.current.click(); close() }}>{t('menu.project')}</MenuItem>
          <MenuSub>{t('menu.groupContrib')}</MenuSub>
          <MenuItem onClick={() => { contribRef.current.click(); close() }}>
            <span title={t('menu.contribImportHint')}>{t('menu.contribImport')}</span>
          </MenuItem>
          <MenuSub>{t('menu.groupReview')}</MenuSub>
          <MenuItem onClick={() => { textRef.current.click(); close() }}>
            <span title={t('toolbar.importEditsHint')}>{t('menu.editsOnly')}</span>
          </MenuItem>
          <MenuDivider />
          <MenuLabel>{t('menu.share')}</MenuLabel>
          <MenuItem onClick={() => { setSharing(true); close() }} desc={t('menu.shareDesc')}>{t('menu.shareOpen')}</MenuItem>
          <MenuItem onClick={() => { openViewer(); close() }} desc={t(share ? 'menu.openViewerDesc' : 'menu.openViewerFirst')}>{t('menu.openViewer')} ›</MenuItem>
          </>}
        </>}
      </Menu>

      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
      <input ref={contribRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleImportContrib} />
      <input ref={textRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportText} />

      <Menu label={t('toolbar.options')} width={270}>
        {close => <>
          {!viewer && <>
          <MenuLabel>{t('toolbar.edit')}</MenuLabel>
          <MenuItem disabled={!canUndo} onClick={() => { undo(); close() }}>{t('toolbar.undoItem')}<Hint>Ctrl/⌘+Z</Hint></MenuItem>
          <MenuItem disabled={!canRedo} onClick={() => { redo(); close() }}>{t('toolbar.redoItem')}<Hint>Shift+Ctrl/⌘+Z</Hint></MenuItem>
          <MenuDivider />
          </>}
          <MenuLabel>{t('toolbar.language')}</MenuLabel>
          {LANGS.map(l => (
            <MenuItem key={l} checked={lang === l} onClick={() => { setLang(l); close() }}>{t(`lang.${l}`)}</MenuItem>
          ))}
          <MenuDivider />
          <MenuLabel>{t('toolbar.theme')}</MenuLabel>
          <MenuItem checked={!darkMode} onClick={() => { if (darkMode) toggleDarkMode(); close() }}>{t('toolbar.themeLight')}</MenuItem>
          <MenuItem checked={darkMode} onClick={() => { if (!darkMode) toggleDarkMode(); close() }}>{t('toolbar.themeDark')}</MenuItem>
          <MenuDivider />
          <MenuLabel>{t('toolbar.view')}</MenuLabel>
          <MenuItem checked={showGrid} onClick={() => setViewAid('showGrid', !showGrid)}>{t('toolbar.showGrid')}</MenuItem>
          <MenuItem checked={showClearance} onClick={() => setViewAid('showClearance', !showClearance)}>
            <span title={t('toolbar.showClearanceHint')}>{t('toolbar.showClearance')}</span>
          </MenuItem>
          {!viewer && <>
          <MenuDivider />
          {!armed
            ? <MenuItem danger onClick={armClear}>{t('toolbar.clearCanvas')}</MenuItem>
            : <div style={{ padding: '6px 14px 6px 28px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ color: '#c00', flexBasis: '100%' }}>{t('toolbar.wipe')}</span>
                <button onClick={() => { confirmClear(); close() }} style={{ ...actionBtn, padding: '3px 10px', borderColor: '#c00', color: '#c00' }}>{t('toolbar.confirm')}</button>
                <button onClick={cancelClear} style={{ ...actionBtn, padding: '3px 10px' }}>{t('toolbar.cancel')}</button>
              </div>}
          </>}
        </>}
      </Menu>

      {/* Help + mode buttons (not in the viewer) */}
      {!viewer && <div style={{ display: 'flex', gap: 0, alignItems: 'center', flex: '1 1 auto' }}>
        <button
          onClick={() => setInboxOpen(!inboxOpen)}
          className="tbtn" data-on={inboxOpen}
          style={{
            padding: '5px 12px', cursor: 'pointer', fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5,
            fontFamily: 'Roboto, sans-serif', whiteSpace: 'nowrap',
          }}
        >
          {t('inbox.button')}{' '}
          {waiting > 0 && <span style={{ fontWeight: 700, color: '#dc2626' }}>{waiting}</span>}
        </button>
        <div ref={helpRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setHelpCols(1); setHelpOpen(v => !v) }}
            className="tbtn" data-on={helpOpen}
            style={{
              padding: '5px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5,
              fontFamily: 'Roboto, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
              <text x="6.5" y="7" textAnchor="middle" dominantBaseline="middle"
                fontSize="7.5" fontFamily="serif" fontStyle="italic" fill="currentColor">i</text>
            </svg>
            {t('toolbar.help')}
          </button>

          {helpOpen && (
            <div ref={setHelpEl} style={{
              position: 'absolute',
              top: helpTop ?? `calc(100% + ${HELP_GAP}px)`,
              left: helpShift,
              background: 'var(--bg-popup)',
              border: '1px solid var(--border-md)',
              borderRadius: 'var(--radius)',
              padding: '10px 18px 0',  // bottom space comes from each section's paddingBottom
              zIndex: 300,
              width: HELP_COL_W * helpCols,
              maxWidth: `calc(100vw - ${HELP_MARGIN * 2}px)`,
              overflow: 'hidden',
              fontFamily: 'Roboto, sans-serif',
              fontSize: 12,
              color: 'var(--text-1)',
              lineHeight: 1.7,
            }}>
              <button
                onClick={() => setHelpOpen(false)}
                aria-label={t('toolbar.closeHelp')}
                style={{
                  position: 'absolute', top: 6, right: 8,
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, color: 'var(--text-2)', lineHeight: 1, padding: '2px 4px',
                }}
              >×</button>
              <div style={{ columnCount: helpCols, columnGap: 28 }}>
                {HELP[lang].map(section => (
                  <section key={section.title} style={{ breakInside: 'avoid', paddingBottom: 14 }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: 11, marginBottom: 4,
                      paddingBottom: 3, borderBottom: '1px solid var(--border-md)' }}>
                      {section.title}
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {section.steps.map((step, i) => <li key={i}>{step}</li>)}
                    </ol>
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* This group's gap is 4px, so 6px of margin makes 10px each side */}
        <OrConnector space={6} />

        {/* Select is the default mode (no button): an add button is armed until used, or clicked again */}
        <span style={{ marginLeft: 'auto', fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Roboto, sans-serif', color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
          {t('toolbar.add')}
        </span>
        {MODES.filter(m => m.id !== 'select' && typesFor(language, [m.id.replace('add-', '')]).length).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setMode(mode === id ? 'select' : id)}
            className="tbtn" data-rest data-on={mode === id}
            style={{
              '--btn-glow': id === 'add-subactor' ? undefined : `var(--hl-${id.replace('add-', '')})`,  // the element's own colour, as in the filter panel (sub-actor's is white: it keeps the default)
              padding: '5px 14px',
              cursor: 'pointer',
              fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5,
              fontFamily: 'Roboto, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>}
      {viewer && (
        <h1 title={diagramName} style={{
          marginLeft: 'auto', padding: '0 16px', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          font: '700 20px Roboto, sans-serif', color: 'var(--text-title)', userSelect: 'none',
        }}>{diagramName}</h1>
      )}
      {sharing && <SharePopup onClose={() => setSharing(false)} />}
    </div>
  )
}


const actionBtn = {
  background: 'var(--bg-popup)',
  border: '1px solid var(--border-md)',
  color: 'var(--text-1)',
  padding: '5px 14px',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'Roboto, sans-serif',
}
