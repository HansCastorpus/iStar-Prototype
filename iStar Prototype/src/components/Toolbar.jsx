import { useRef, useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import useStore from '../store/useStore.js'
import { useT, LANGS } from '../i18n.js'

const MODES = [
  { id: 'select',         label: 'toolbar.select' },
  { id: 'add-goal',       label: 'toolbar.addGoal' },
  { id: 'add-task',       label: 'toolbar.addTask' },
  { id: 'add-softgoal',   label: 'toolbar.addSoftgoal' },
  { id: 'add-resource',   label: 'toolbar.addResource' },
]

const TOOLBAR_PAD_X = 8

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
  return (
    <svg width="32" height="14" viewBox="0 0 32 14" style={iconStyle}>
      <rect x="0.5" y="0.5" width="31" height="13" rx="6.5" fill="var(--node-fill)" stroke="var(--node-stroke)" strokeWidth="1"/>
      <text x="16" y="7.5" textAnchor="middle" dominantBaseline="middle" fontSize="7" fontFamily="sans-serif" fill="var(--node-text)">AND</text>
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

function Logo() {
  const H = 24, MID = H / 2
  const goal = { x: 1, w: 52 }
  const res  = { x: 84, w: 62 }
  const tip = res.x, barX = tip - LOGO_ARROW_H - LOGO_ICON_GAP
  const text = { fontSize: 12, fontFamily: 'monospace', fill: 'var(--node-text)',
    textAnchor: 'middle', dominantBaseline: 'central' }
  return (
    <svg width={res.x + res.w + 1} height={H} viewBox={`0 0 ${res.x + res.w + 1} ${H}`}
      role="img" aria-label="iStar Builder" style={{ display: 'block' }}>
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
// line → hollow circle (ICON_R) → ICON_GAP → floating arrowhead.
// `space`: side margin; it adds to the parent's flex gap to make 10px each side (toolbar gap 8 → 2).
function OrConnector({ space = 2 }) {
  const W = 34, H = 14, MID = H / 2, tip = W
  const cx = tip - LOGO_ARROW_H - LOGO_ICON_GAP - LOGO_ICON_R
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden
      style={{ display: 'block', flexShrink: 0, margin: `0 ${space}px`, overflow: 'visible' }}>
      <line x1={0} y1={MID} x2={cx} y2={MID} stroke="var(--link-def)" strokeWidth={LOGO_LINE_W} />
      <circle cx={cx} cy={MID} r={LOGO_ICON_R - LOGO_LINE_W / 2}
        fill="var(--node-fill)" stroke="var(--link-def)" strokeWidth={LOGO_LINE_W} />
      <polygon fill="var(--link-def)"
        points={`${tip},${MID} ${tip - LOGO_ARROW_H},${MID - LOGO_ARROW_HW} ${tip - LOGO_ARROW_H},${MID + LOGO_ARROW_HW}`} />
    </svg>
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
      <>Click an element to select it: it gets a <B>blue</B> outline <BlueShape /> and a popup opens to edit its label, type and actor. Press <B>Enter</B> to confirm what you typed.</>,
      <>Click the selected element again to deselect it.</>,
      <>The popup places itself so it covers as little of the diagram as possible. Drag it by its top bar, or use <B>hide</B> / <B>show</B> to minimise it.</>,
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

export default function Toolbar() {
  const { mode, setMode, exportDiagram, importDiagram, clearDiagram, exportAsImage, darkMode, toggleDarkMode } = useStore()
  const filterCardBox = useStore(s => s.filterCardBox)
  const lang = useStore(s => s.lang)
  const setLang = useStore(s => s.setLang)
  const t = useT()
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
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [helpOpen])

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
      gap: 8,
      padding: `8px ${TOOLBAR_PAD_X}px`,
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      flexShrink: 0,
    }}>
      {/* Logo, centred over the Filter card below (toolbar starts at the window's left edge) */}
      <span style={{
        width: filterCardBox?.width, flexShrink: 0,
        marginLeft: filterCardBox ? filterCardBox.left - TOOLBAR_PAD_X : 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Logo />
      </span>
      <span style={{ flex: 1 }} />

      {/* Mode buttons */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <div ref={helpRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setHelpCols(1); setHelpOpen(v => !v) }}
            style={{
              background: helpOpen ? 'var(--text-1)' : 'none',
              color: helpOpen ? 'var(--bg-popup)' : 'var(--text-1)',
              border: '1px solid var(--border-md)',
              padding: '5px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 13,
              fontFamily: 'monospace',
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
              padding: '10px 18px 0',  // bottom space comes from each section's paddingBottom
              zIndex: 300,
              width: HELP_COL_W * helpCols,
              maxWidth: `calc(100vw - ${HELP_MARGIN * 2}px)`,
              overflow: 'hidden',
              fontFamily: 'monospace',
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

        {MODES.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            style={{
              background: mode === id ? 'var(--text-1)' : 'none',
              color: mode === id ? 'var(--bg-popup)' : 'var(--text-1)',
              border: '1px solid var(--border-md)',
              padding: '5px 14px',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>

      <OrConnector />

      {/* Export / Import */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button onClick={exportDiagram} style={actionBtn}>{t('toolbar.exportJson')}</button>
        <button onClick={() => exportAsImage('png')} style={actionBtn}>PNG</button>
        <button onClick={() => exportAsImage('jpeg')} style={actionBtn}>JPEG</button>
        <button onClick={() => fileRef.current.click()} style={actionBtn}>{t('toolbar.import')}</button>
        <input ref={fileRef} type="file" accept=".json"
          style={{ display: 'none' }} onChange={handleImport} />
      </div>

      <OrConnector />

      {/* Language + Dark mode + Clear */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <div role="group" aria-label={t('toolbar.language')} style={{ display: 'flex' }}>
          {LANGS.map((l, i) => (
            <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} style={{
              ...actionBtn,
              padding: '5px 10px',
              marginLeft: i ? -1 : 0,  // share the border between the two halves
              background: lang === l ? 'var(--text-1)' : 'none',
              color: lang === l ? 'var(--bg-popup)' : 'var(--text-1)',
            }}>{l.toUpperCase()}</button>
          ))}
        </div>
        <button onClick={toggleDarkMode} style={actionBtn}>{darkMode ? t('toolbar.light') : t('toolbar.dark')}</button>
        {!armed ? (
          <button onClick={armClear} style={actionBtn}>{t('toolbar.clear')}</button>
        ) : (
          <>
            <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#c00', whiteSpace: 'nowrap' }}>{t('toolbar.wipe')}</span>
            <button onClick={confirmClear} style={{ ...actionBtn, borderColor: '#c00', color: '#c00' }}>{t('toolbar.confirm')}</button>
            <button onClick={cancelClear} style={actionBtn}>{t('toolbar.cancel')}</button>
          </>
        )}
      </div>
    </div>
  )
}


const actionBtn = {
  background: 'none',
  border: '1px solid var(--border-md)',
  color: 'var(--text-1)',
  padding: '5px 14px',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'monospace',
}
