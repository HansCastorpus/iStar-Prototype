import { typesFor } from '../utils/language.js'
import { useState, useEffect, useMemo } from 'react'
import { flushSync } from 'react-dom'
import useStore, { ALL_TYPES } from '../store/useStore.js'
import { LegendIcon, LEGEND_W } from './LegendIcons.jsx'
import { upstreamLayerCount, focusView } from '../utils/dependencies.js'
import { useT } from '../i18n.js'
import { actorLayout, measureText, actorTintVar } from '../utils/actorTree.js'

const NODE_TYPES = ['goal', 'task', 'softgoal', 'resource', 'subactor']
const LINK_TYPES = ['depends-on', 'or', 'xor', 'and', 'help', 'hurt', 'make', 'break', 'needed-by', 'part-of']
const ACTOR_TYPES = ['actor']

// Each header column holds one toggle button that is as wide as the longer of its two labels in the current language.
const COL_I_PAD_L = 10  // extra room between the divider and the visibility column
const PANEL_CHROME = 50 // panel padding (2 × 12) + card border (2) + card padding (2 × 12)
const BTN_CHROME  = 10  // header button padding (2 × 4) + border (2)

// Width of `text` in the header buttons' font
let measureCtx = null
function buttonTextW(text) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  measureCtx.font = '10px Roboto, sans-serif'
  return Math.ceil(measureCtx.measureText(text).width)
}

const LEGEND_GAP = 6  // space between legend icon and checkbox
const SQUARE = 16

// Shared column styles so header buttons and row checkboxes line up exactly. Widths fit the current
// language's button labels; with the legend on, columns grow just enough for checkbox + legend icon.
// Cells hold only the legend icon (no checkbox): the same room on every side of it. The tallest element
// sample is 18px, so a row is 18 + 2 × CELL_PAD high, and the legend columns are the widest sample + 2 × CELL_PAD.
const CELL_PAD = 6
const ROW_H = 18 + 2 * CELL_PAD
function useColumns() {
  const t = useT()
  return useMemo(() => {
    const widest = (keys) => Math.max(...keys.map(k => buttonTextW(t(k)))) + BTN_CHROME
    const label = widest(['filter.showTags', 'filter.hideTags']) + 16  // the name column keeps its original width
    const i = widest(['filter.showAll', 'filter.hideAll'])
    const h = widest(['filter.highlightAll', 'filter.clearAll'])
    const iW = (legend) => legend ? Math.max(i, LEGEND_W + 2 * CELL_PAD) : i
    const hW = (legend) => legend ? Math.max(h, LEGEND_W + 2 * CELL_PAD) : h
    return {
      panelWidth: (legend) => PANEL_CHROME + label + iW(legend) + hW(legend),
      colI: (legend) => ({ width: iW(legend), flexShrink: 0, padding: `0 4px 0 ${COL_I_PAD_L}px` }),
      colH: (legend) => ({ width: hW(legend), flexShrink: 0, padding: '0 4px' }),
    }
  }, [t])
}

export default function FilterPanel() {
  const t = useT()
  const language = useStore(s => s.language)
  const { panelWidth: basePanelWidth, colI, colH } = useColumns()
  const highlightTypes      = useStore(s => s.highlightTypes)
  const isolateTypes        = useStore(s => s.isolateTypes)
  const toggleHighlightType = useStore(s => s.toggleHighlightType)
  const toggleIsolateType   = useStore(s => s.toggleIsolateType)
  const hiddenActorIds      = useStore(s => s.hiddenActorIds)
  const setAllHighlight     = useStore(s => s.setAllHighlight)
  const setAllIsolate       = useStore(s => s.setAllIsolate)
  const focusNodeId         = useStore(s => s.focusNodeId)
  const focusDeep           = useStore(s => s.focusDeep)
  const setFocusNode        = useStore(s => s.setFocusNode)
  const focusDepth          = useStore(s => s.focusDepth)
  const setFocusDepth       = useStore(s => s.setFocusDepth)
  const selectedId          = useStore(s => s.selectedId)
  const selectedType        = useStore(s => s.selectedType)
  const selectedActorId     = useStore(s => s.selectedActorId)

  const legendOpen   = useStore(s => s.legendOpen)
  const hideTags     = useStore(s => s.hideTags)
  const setHideTags    = useStore(s => s.setHideTags)

  const pathOn         = useStore(s => s.pathOn)
  const togglePath     = useStore(s => s.togglePath)
  const selectedIds    = useStore(s => s.selectedIds)
  const canPath        = selectedIds.length === 2 && !selectedActorId
  const hasPath        = useStore(s => pathOn && canPath && !!focusView(s))
  const canFocus       = selectedType === 'node' && !!selectedId
  const isDirectActive = !!focusNodeId && focusNodeId === selectedId && !focusDeep
  const isDeepActive   = !!focusNodeId && focusNodeId === selectedId && focusDeep

  // Layers that actually exist upstream of the selected element (the stepper's upper bound)
  const maxLayers = useStore(s => canFocus ? upstreamLayerCount(s.links, selectedId) : 0)
  const layers = maxLayers ? Math.min(focusDepth, maxLayers) : focusDepth
  const changeLayers = (n) => {
    setFocusDepth(n)
    if (!isDirectActive) setFocusNode(selectedId, false)  // adjusting layers switches the view on
  }

  const [actorPanelOpen, setActorPanelOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(true)
  const [depsOpen, setDepsOpen] = useState(true)
  // Kept here (not in Section) so the choices survive the whole panel being minimised
  const [sectionOpen, setSectionOpen] = useState({ elements: true, links: true, actors: true })
  const sectionProps = (key) => ({ open: sectionOpen[key], onToggle: () => setSectionOpen(o => ({ ...o, [key]: !o[key] })) })

  // Pressing anywhere on the diagram canvas closes the actor panel
  useEffect(() => {
    if (!actorPanelOpen) return
    const onDown = (e) => { if (e.target.closest?.('#diagram-canvas')) setActorPanelOpen(false) }
    document.addEventListener('pointerdown', onDown, true)  // capture: canvas items stop propagation
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [actorPanelOpen])

  // Track whether the panel's content is taller than the panel (i.e. a scrollbar is showing)
  const [panelEl, setPanelEl] = useState(null)
  const [overflows, setOverflows] = useState(false)
  useEffect(() => {
    if (!panelEl) return
    // flushSync: apply the new width in the same frame the overflow is detected, so there's no flicker
    const check = () => flushSync(() => setOverflows(panelEl.scrollHeight > panelEl.clientHeight + 1))
    const ro = new ResizeObserver(check)
    ro.observe(panelEl)
    for (const card of panelEl.children) ro.observe(card)  // cards grow when sections expand
    return () => ro.disconnect()
  }, [panelEl])

  // A bulk button reads as active when the current state matches what it would set
  const allVisible      = ALL_TYPES.every(t => isolateTypes.includes(t)) && hiddenActorIds.length === 0
  const allHighlighted  = ALL_TYPES.every(t => highlightTypes.includes(t))

  const collapsed = useStore(s => s.filterCollapsed)
  const toggleCollapsed = useStore(s => s.toggleFilterCollapsed)
  const panelWidth = collapsed ? COLLAPSED_W : basePanelWidth(legendOpen)

  // Share the Filter card's on-screen position so the toolbar can centre the logo over it
  const [filterCardEl, setFilterCardEl] = useState(null)
  const setFilterCardBox = useStore(s => s.setFilterCardBox)
  useEffect(() => {
    if (!filterCardEl) return
    const publish = () => {
      const r = filterCardEl.getBoundingClientRect()
      setFilterCardBox({ left: r.left, width: r.width })
    }
    const ro = new ResizeObserver(publish)
    ro.observe(filterCardEl)
    window.addEventListener('resize', publish)
    return () => { ro.disconnect(); window.removeEventListener('resize', publish) }
  }, [filterCardEl, setFilterCardBox])

  // Share where the panel ends so the logo container lines up with the cards
  const setFilterPanelRight = useStore(s => s.setFilterPanelRight)
  useEffect(() => {
    if (panelEl) setFilterPanelRight(panelEl.getBoundingClientRect().right)
  }, [panelEl, panelWidth, setFilterPanelRight])

  return (
    <>
    <div ref={setPanelEl} className="no-scrollbar" style={{
      // Equal padding around the cards; when the content overflows, the panel widens by the
      // scrollbar's width so the scrollbar sits in its own strip at the edge instead of squeezing the cards
      width: panelWidth,
      // Floats over the canvas (diagram and grid show underneath). Only the cards take the mouse, except while
      // the cards overflow: then the panel itself takes it, so it can scroll (the cards fill its height anyway)
      position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 100, pointerEvents: overflows && !collapsed ? 'auto' : 'none',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      // Scrolling only switches on once the panel has widened, so the scrollbar never squeezes the cards
      overflowY: collapsed ? 'hidden' : overflows ? 'auto' : 'hidden',
      padding: collapsed ? 6 : 12,
      gap: 12,
    }}>
      {collapsed && (
        <button onClick={toggleCollapsed} title={t('filter.expand')} aria-label={t('filter.expand')}
          style={collapseBtn}>»</button>
      )}
      {/* Filter container */}
      {!collapsed && <>
      <div ref={setFilterCardEl} style={cardStyle}>
        <DropHeader open={filterOpen} onToggle={() => setFilterOpen(o => !o)} style={{ ...cardTitle, marginBottom: filterOpen ? 6 : 0 }}
          extra={<button onClick={toggleCollapsed} title={t('filter.collapse')} aria-label={t('filter.collapse')}
            style={collapseBtn}>«</button>}>
          {t('filter.title')}
        </DropHeader>
        {filterOpen && <>

        <NumberTools />

        {/* Column headers */}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          {/* One toggle per column: dark while on (labelled with what a click undoes), light while off */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            <button onClick={() => setHideTags(!hideTags)} className="tbtn" data-on={!hideTags} style={filterBtnStyle}>
              {t(hideTags ? 'filter.showTags' : 'filter.hideTags')}
            </button>
          </div>
          <div style={{ ...colI(legendOpen), ...cellColumn, display: 'flex' }}>
            <button onClick={() => setAllIsolate(!allVisible)} className="tbtn" data-on={allVisible} style={filterBtnStyle}>
              {t(allVisible ? 'filter.hideAll' : 'filter.showAll')}
            </button>
          </div>
          <div style={{ ...colH(legendOpen), ...cellColumn, display: 'flex' }}>
            <button onClick={() => setAllHighlight(!allHighlighted)} className="tbtn" data-on={allHighlighted} style={filterBtnStyle}>
              {t(allHighlighted ? 'filter.clearAll' : 'filter.highlightAll')}
            </button>
          </div>
        </div>

        <Section label={t('filter.elements')} types={typesFor(language, NODE_TYPES)} first legend={legendOpen} {...sectionProps('elements')}
          highlightTypes={highlightTypes} isolateTypes={isolateTypes}
          onToggleH={toggleHighlightType} onToggleI={toggleIsolateType} />

        <Section label={t('filter.links')} types={typesFor(language, LINK_TYPES)} legend={legendOpen} {...sectionProps('links')}
          highlightTypes={highlightTypes} isolateTypes={isolateTypes}
          onToggleH={toggleHighlightType} onToggleI={toggleIsolateType} />

        <Section label={t('filter.actors')} types={ACTOR_TYPES} legend={legendOpen} {...sectionProps('actors')}
          highlightTypes={highlightTypes} isolateTypes={isolateTypes}
          onToggleH={toggleHighlightType} onToggleI={toggleIsolateType}>
          <ActorListToggle open={actorPanelOpen} onToggle={() => setActorPanelOpen(o => !o)} />
        </Section>
        </>}
      </div>

      {/* Dependencies container */}
      <div style={{ ...cardStyle, gap: 6 }}>
        <DropHeader open={depsOpen} onToggle={() => setDepsOpen(o => !o)} style={{ ...cardTitle, marginBottom: depsOpen ? 6 : 0 }}>
          {t('deps.title')}
        </DropHeader>
        {depsOpen && <>
        <div style={infoText}>
          <strong style={{ color: 'var(--text-1)' }}>{t('deps.infoLead')}</strong> {t('deps.info')}
        </div>
        <button
          onClick={() => canFocus && setFocusNode(selectedId, false)}
          disabled={!canFocus}
          style={focusBtnStyle(isDirectActive, canFocus)}
        >
          {isDirectActive ? t('deps.clear') : t('deps.relationships')}
        </button>
        <LayerStepper
          value={layers}
          max={maxLayers}
          enabled={canFocus && maxLayers > 0}
          onChange={changeLayers}
        />
        <button
          onClick={() => canFocus && setFocusNode(selectedId, true)}
          disabled={!canFocus}
          style={focusBtnStyle(isDeepActive, canFocus)}
        >
          {isDeepActive ? t('deps.clear') : t('deps.all')}
        </button>
        <button
          onClick={() => (canPath || pathOn) && togglePath()}
          disabled={!canPath && !pathOn}
          style={focusBtnStyle(pathOn, canPath || pathOn)}
        >
          {pathOn ? t('deps.pathClear') : t('deps.path')}
        </button>
        {(pathOn || canPath || canFocus || selectedIds.length > 0) && (
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'Roboto, sans-serif', lineHeight: 1.5 }}>
            {pathOn && canPath ? (hasPath ? t('deps.pathShowing') : t('deps.pathNone')) : t('deps.pathHint')}
          </div>
        )}
        {/* Current status */}
        {(!canFocus || isDirectActive || isDeepActive) && (
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'Roboto, sans-serif', marginTop: 2, lineHeight: 1.5 }}>
            {!canFocus
              ? t('deps.noSelection')
              : isDeepActive
              ? t('deps.showingAll')
              : layers === 1 ? t('deps.showingLayer') : t('deps.showingLayers', { n: layers })}
          </div>
        )}
        </>}
      </div>
      </>}
    </div>
    {actorPanelOpen && !collapsed && <ActorPanel left={panelWidth} onClose={() => setActorPanelOpen(false)} />}
    </>
  )
}

// Switch for the element numbers + a box to find an element by its number and zoom in on it
function NumberTools() {
  const t = useT()
  const showNumbers = useStore(s => s.showNumbers)
  const setShowNumbers = useStore(s => s.setShowNumbers)
  const [query, setQuery] = useState('')
  const [missing, setMissing] = useState(false)
  const find = (e) => {
    e.preventDefault()
    const n = parseInt(query.replace(/^\D+/, ''), 10)
    const st = useStore.getState()
    const node = Object.values(st.nodes).find(x => x.num === n)
    setMissing(!node)
    if (!node) return
    st.select(node.id, 'node')
    st.zoomToNode(node.id)
  }
  return (
    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11,
        fontFamily: 'Roboto, sans-serif', color: 'var(--text-1)', userSelect: 'none' }}>
        <button type="button" role="switch" aria-checked={showNumbers} onClick={() => setShowNumbers(!showNumbers)} style={{
          width: 30, height: 16, borderRadius: 8, padding: 0, flexShrink: 0, cursor: 'pointer', position: 'relative',
          border: '1px solid var(--border-md)', background: showNumbers ? 'var(--bg-selected)' : 'var(--node-fill)',
        }}>
          <span style={{ position: 'absolute', top: 2, left: showNumbers ? 16 : 2, width: 10, height: 10, borderRadius: 5,
            background: 'var(--text-1)', transition: 'left 0.12s' }} />
        </button>
        {t('filter.numbers')}
      </label>
      <form onSubmit={find} style={{ display: 'flex', gap: 4 }}>
        <input value={query} onChange={e => { setQuery(e.target.value); setMissing(false) }}
          placeholder={t('filter.findPlaceholder')} inputMode="numeric" spellCheck={false} aria-label={t('filter.findPlaceholder')}
          style={{ flex: 1, minWidth: 0, padding: '5px 8px', fontSize: 11, fontFamily: 'Roboto, sans-serif',
            background: 'var(--node-fill)', color: 'var(--text-1)', border: `1px solid ${missing ? '#dc2626' : 'var(--border-md)'}` }} />
        <button type="submit" title={t('actors.zoom')} aria-label={t('actors.zoom')} style={{
          background: 'var(--node-fill)', border: '1px solid var(--border-md)', cursor: 'pointer', padding: '0 8px', color: 'var(--text-1)', display: 'flex', alignItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <circle cx="5.5" cy="5.5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <line x1="8.5" y1="8.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </form>
      {missing && <div style={{ fontSize: 10, color: '#dc2626', fontFamily: 'Roboto, sans-serif' }}>{t('filter.findNone', { n: query })}</div>}
    </div>
  )
}

// "Layers  − 2 / 4 +" control for how far back "Highlight relationships" reaches
function LayerStepper({ value, max, enabled, onChange }) {
  const t = useT()
  // Same look as the other panel buttons (incl. their disabled state), just sized to the symbol
  const stepBtn = (disabled) => ({ ...focusBtnStyle(false, !disabled), width: 'auto', minWidth: 30 })
  const canDec = enabled && value > 1
  const canInc = enabled && value < max
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2,
      fontSize: 10, fontFamily: 'Roboto, sans-serif', color: enabled ? 'var(--text-2)' : 'var(--text-3)' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{t('deps.layers')}</span>
      {/* Arrow from the label to the buttons, stretching across the free space */}
      <span aria-hidden style={{ flex: 1, minWidth: 16, display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1, height: 1, background: 'currentColor' }} />
        <svg width="5" height="8" viewBox="0 0 5 8" style={{ flexShrink: 0, display: 'block' }}>
          <path d="M0,0 L5,4 L0,8 Z" fill="currentColor" />
        </svg>
      </span>
      <button onClick={() => onChange(value - 1)} disabled={!canDec} aria-label={t('deps.fewer')} style={stepBtn(!canDec)}><StepIcon /></button>
      <span style={{ minWidth: 36, textAlign: 'center', color: enabled ? 'var(--text-1)' : 'var(--text-3)' }}>
        {enabled ? `${value} / ${max}` : '–'}
      </span>
      <button onClick={() => onChange(value + 1)} disabled={!canInc} aria-label={t('deps.more')} style={stepBtn(!canInc)}><StepIcon plus /></button>
    </div>
  )
}

// − / + drawn as a 10px icon: bigger than the 10px text glyph, without making the button taller
function StepIcon({ plus = false }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ verticalAlign: 'middle' }}>
      <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {plus && <line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  )
}

function Chevron({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }}>
      <path d="M3 1 L7 5 L3 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Header that folds / unfolds the content under it
export function DropHeader({ open, onToggle, style, children, extra }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, ...style }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{
        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, padding: 0, background: 'none', border: 'none',
        cursor: 'pointer', color: 'inherit', font: 'inherit', textTransform: 'inherit', textAlign: 'left',
      }}>
        <Chevron open={open} />{children}
      </button>
      {extra}
    </div>
  )
}

function SectionLabel({ first, open, onToggle, children }) {
  return (
    <DropHeader open={open} onToggle={onToggle} style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-1)', fontFamily: 'Roboto, sans-serif', textTransform: 'uppercase', marginTop: first ? 6 : 12, marginBottom: 4,
      paddingBottom: 4, borderBottom: '1px solid var(--text-1)' }}>
      {children}
    </DropHeader>
  )
}

function Section({ label, first, legend, types, highlightTypes, isolateTypes, onToggleH, onToggleI, open, onToggle, children }) {
  const t = useT()
  return (
    <>
      <SectionLabel first={first} open={open} onToggle={onToggle}>{label}</SectionLabel>
      {/* Rows touch each other (the card's 4px gap would leave white strips between the cells) */}
      {open && <div style={{ display: 'flex', flexDirection: 'column' }}>
      {types.map((type, i) => (
        <TypeRow
          key={type} label={t(`type.${type}`)} legendType={type} legend={legend} cells
          inHighlight={highlightTypes.includes(type)}
          inIsolate={isolateTypes.includes(type)}
          onToggleH={() => onToggleH(type)}
          onToggleI={() => onToggleI(type)}
          runI={{ prev: i > 0 && isolateTypes.includes(types[i - 1]), next: i < types.length - 1 && isolateTypes.includes(types[i + 1]) }}
          runH={{ prev: i > 0 && highlightTypes.includes(types[i - 1]), next: i < types.length - 1 && highlightTypes.includes(types[i + 1]) }}
        />
      ))}
      </div>}
      {open && children}
    </>
  )
}

// With cells, the column spans the row's full height and has no padding, so the toggle fills it
const cellColumn = { alignSelf: 'stretch', padding: 0 }

// A column cell used as a toggle: flat darker background while on, the soft blurred patch of the header buttons on hover.
// Selected cells join into one shape (above / below in the column, and across the two columns of a row),
// and only the outer corners of that shape are rounded.
// run: whether the cell above / below (same section) is on too. side: which of the two columns this is;
// partner: whether the other column's cell in the same row is on.
function Cell({ active, onClick, run, side, partner, children }) {
  const R = 'var(--radius)'
  const joinLeft = side === 'right' && partner, joinRight = side === 'left' && partner
  const corner = (vertical, horizontal) => (vertical || horizontal ? 0 : R)
  const radius = [corner(run?.prev, joinLeft), corner(run?.prev, joinRight), corner(run?.next, joinRight), corner(run?.next, joinLeft)].join(' ')
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="tbtn" style={{
      // .tbtn gives the soft blurred patch on hover (no data-on: the selected look is the flat joined shape)
      flex: 1, alignSelf: 'stretch', padding: 0, margin: 0, border: 'none', cursor: 'pointer',
      borderRadius: active ? radius : 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: LEGEND_GAP,
      background: active ? 'var(--cell-on)' : 'transparent', color: 'var(--text-1)',
    }}>{children}</button>
  )
}

// legendType: which sample to show when the legend is on (null = blank space, keeps checkboxes aligned)
// cells: no checkbox; the whole column cell is the toggle, with a darker background while on
// wrap: let long labels run onto several lines instead of being cut off with "…"
// cols: { i, h } styles to use instead of the filter panel's columns (the actor panel's are narrower)
function TypeRow({ label, tint, indent = 0, legendType = label, wrap = false, cells = false, runI, runH, cols, legend, inHighlight, inIsolate, onToggleH, onToggleI, onZoom, logo }) {
  const t = useT()
  const panelCols = useColumns()
  const iStyle = cols?.i ?? panelCols.colI(legend)
  const hStyle = cols?.h ?? panelCols.colH(legend)
  const slot = (highlighted) => !legend ? null
    : legendType ? <LegendSlot type={legendType} highlighted={highlighted} />
    : <div style={{ width: LEGEND_W, flexShrink: 0 }} />
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: cells ? 0 : '4px 0', minHeight: cells ? ROW_H : undefined, paddingLeft: indent * NEST_INDENT,
      ...(tint && { background: `color-mix(in srgb, ${tint} 20%, transparent)`, borderLeft: `4px solid ${tint}`, paddingLeft: indent * NEST_INDENT + 6 }) }}>
      {indent > 0 && <span aria-hidden style={{ color: 'var(--text-3)', fontFamily: 'Roboto, sans-serif', fontSize: 12, marginRight: 4, userSelect: 'none' }}>└</span>}
      <span title={label} style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'Roboto, sans-serif', color: 'var(--text-1)', userSelect: 'none', textAlign: 'left', paddingRight: 8,
        ...(wrap
          ? { whiteSpace: 'nowrap' }
          : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>
        {label}
      </span>
      {logo && <img src={logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0, marginRight: 8 }} />}
      <div style={{ ...iStyle, ...(cells && cellColumn), display: 'flex', justifyContent: 'center', alignItems: 'center', gap: LEGEND_GAP }}>
        {cells ? <Cell active={inIsolate} onClick={onToggleI} run={runI} side="left" partner={inHighlight}>{slot(false)}</Cell> : <>
          <Square active={inIsolate} onClick={onToggleI} />
          {slot(false)}
        </>}
      </div>
      <div style={{ ...hStyle, ...(cells && cellColumn), display: 'flex', justifyContent: 'center', alignItems: 'center', gap: LEGEND_GAP }}>
        {cells ? <Cell active={inHighlight} onClick={onToggleH} run={runH} side="right" partner={inIsolate}>{slot(true)}</Cell> : <>
          <Square active={inHighlight} onClick={onToggleH} />
          {slot(true)}
        </>}
      </div>
      {onZoom && (
        <div style={ZOOM_COL}>
          <button type="button" onClick={onZoom} title={t('actors.zoom')} aria-label={t('actors.zoom')} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-2)', display: 'flex',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <circle cx="5.5" cy="5.5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <line x1="8.5" y1="8.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

// Button in the Actors section that opens the per-actor panel
function ActorListToggle({ open, onToggle }) {
  const t = useT()
  const count = useStore(s => Object.keys(s.actors).length)
  return (
    <button onClick={onToggle} disabled={!count} aria-expanded={open}
      style={{ ...colBtnStyle(open), width: '100%', marginTop: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', fontSize: 11, textAlign: 'left',
        ...(!count && { color: 'var(--text-3)', cursor: 'default' }) }}>
      <span>{count ? t('filter.eachActor', { n: count }) : t('filter.noActors')}</span>
      {count > 0 && <span aria-hidden>{open ? '◂' : '▸'}</span>}
    </button>
  )
}

const NEST_INDENT = 16  // px each nesting level is shifted right in the actor list
const ACTOR_PANEL_W = 280
// Everything in a row besides the name text: panel + card padding and border, the two checkbox
// columns, zoom column, name gap, nesting arrow and scrollbar room
const ROW_EXTRA = 24 + 24 + 2 + 56 + 56 + 32 + 8 + 16 + 16 + 10  // + colour bar
const LOGO_SLOT = 28
// Narrow checkbox columns for the actor panel: just the checkbox and its small column label
const ACTOR_COL = { width: 56, flexShrink: 0, borderLeft: '1px solid var(--border-lt)', padding: '0 2px' }
const ACTOR_COLS = { i: ACTOR_COL, h: ACTOR_COL }
const ZOOM_COL = { width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }

// Side panel next to the filter panel: every actor with its own hide / highlight checkboxes
function ActorPanel({ left, onClose }) {
  const t = useT()
  const actors              = useStore(s => s.actors)
  const hiddenActorIds      = useStore(s => s.hiddenActorIds)
  const highlightedActorIds = useStore(s => s.highlightedActorIds)
  const toggleActorHidden    = useStore(s => s.toggleActorHidden)
  const toggleActorHighlight = useStore(s => s.toggleActorHighlight)
  const zoomToActor          = useStore(s => s.zoomToActor)
  // The "actor" type row applies to every actor, so the per-actor boxes show the combined state
  const actorsVisible       = useStore(s => s.isolateTypes.includes('actor'))
  const actorsHighlighted   = useStore(s => s.highlightTypes.includes('actor'))

  // Primary actors by name, each followed by the actors nested in it (staggered), and so on down
  const nodes = useStore(s => s.nodes)
  const list = useMemo(() => {
    const { parentOf } = actorLayout(nodes)
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '')
    const kids = {}
    const roots = []
    for (const a of Object.values(actors)) {
      const p = parentOf[a.id]
      if (p && actors[p]) (kids[p] ??= []).push(a)
      else roots.push(a)
    }
    const out = []
    const walk = (a, indent, seen) => {
      if (seen.has(a.id)) return
      out.push({ actor: a, indent })
      for (const c of (kids[a.id] ?? []).sort(byName)) walk(c, indent + 1, new Set([...seen, a.id]))
    }
    for (const r of roots.sort(byName)) walk(r, 0, new Set())
    return out
  }, [actors, nodes])
  const colLabel = { fontSize: 9, color: 'var(--text-3)', fontFamily: 'Roboto, sans-serif', textAlign: 'center' }

  // Wide enough that no actor name is cut or broken: the longest row decides
  const panelW = Math.max(ACTOR_PANEL_W, ...list.map(({ actor: a, indent }) =>
    Math.ceil(measureText(a.name || t('actors.unnamed'), '12px Roboto, sans-serif')) + indent * NEST_INDENT + ROW_EXTRA + (a.logo ? LOGO_SLOT : 0)))

  return (
    <div className="panel-slide-in" style={{
      position: 'absolute', left, top: 0, bottom: 0, width: panelW, maxWidth: `calc(100% - ${left}px)`, zIndex: 150,
      background: 'var(--bg-panel)', borderRight: '1px solid var(--border)',
      overflowY: 'auto', padding: 12,
    }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ ...cardTitle, flex: 1, marginBottom: 0 }}>{t('actors.title')}</div>
          <button onClick={onClose} aria-label={t('actors.close')} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1,
            color: 'var(--text-2)', padding: '0 2px',
          }}>×</button>
        </div>

        {/* Column labels, aligned with the checkbox columns */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, paddingBottom: 4, borderBottom: '1px solid var(--border-lt)' }}>
          <div style={{ flex: 1 }} />
          <div style={{ ...ACTOR_COL, ...colLabel }}>{t('actors.visible')}</div>
          <div style={{ ...ACTOR_COL, ...colLabel }}>{t('actors.highlight')}</div>
          <div style={{ ...ZOOM_COL, ...colLabel }}>{t('actors.zoom')}</div>
        </div>

        {list.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Roboto, sans-serif', padding: '6px 0' }}>{t('actors.none')}</div>
        )}
        {list.map(({ actor: a, indent }) => (
          <TypeRow
            key={a.id} label={a.name || t('actors.unnamed')} tint={actorsHighlighted || highlightedActorIds.includes(a.id) ? actorTintVar(actors, a.id) : null} indent={indent} legendType={null} legend={false} wrap cols={ACTOR_COLS}
            inIsolate={actorsVisible && !hiddenActorIds.includes(a.id)}
            inHighlight={actorsHighlighted || highlightedActorIds.includes(a.id)}
            onToggleI={() => toggleActorHidden(a.id)}
            onToggleH={() => toggleActorHighlight(a.id)}
            onZoom={() => zoomToActor(a.id, panelW)}
            logo={a.logo}
          />
        ))}
      </div>
    </div>
  )
}

function LegendSlot({ type, highlighted }) {
  return (
    <div style={{ width: LEGEND_W, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <LegendIcon type={type} highlighted={highlighted} />
    </div>
  )
}

function Square({ active, onClick }) {
  return (
    <button type="button" role="checkbox" aria-checked={active} onClick={onClick} style={{
      width: SQUARE, height: SQUARE, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '2px solid var(--border-ck)',
      borderRadius: 3,
      background: 'var(--node-fill)',
      color: 'var(--text-1)',
      padding: 0,
      cursor: 'pointer',
    }}>
      {active && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 5.2 L4 7.5 L8.5 2.5" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  flexShrink: 0,
  padding: 12,
  background: 'var(--bg-popup)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.12)',
  pointerEvents: 'auto',
}

const infoText = {
  fontSize: 10, color: 'var(--text-2)', fontFamily: 'Roboto, sans-serif', lineHeight: 1.5, marginBottom: 6,
}

const COLLAPSED_W = 44
const collapseBtn = {
  background: 'var(--node-fill)', color: 'var(--text-1)', border: '1px solid var(--border-md)',
  width: 28, height: 24, padding: 0, cursor: 'pointer', pointerEvents: 'auto', fontSize: 14, fontFamily: 'Roboto, sans-serif', lineHeight: 1,
}

const cardTitle = {
  fontSize: 13, fontWeight: 'bold', color: 'var(--text-1)', fontFamily: 'Roboto, sans-serif', textTransform: 'uppercase', marginBottom: 6,
}

const colBtn = {
  background: 'var(--node-fill)',
  border: '1px solid var(--border-md)',
  width: '100%',
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 10,
  fontFamily: 'Roboto, sans-serif',
  color: 'var(--text-1)',
  textAlign: 'center',
  whiteSpace: 'nowrap',
}

const colBtnStyle = (active) => ({
  ...colBtn,
  background: active ? 'var(--bg-selected)' : 'var(--node-fill)',
  color: active ? 'var(--bg-selected-text)' : 'var(--text-1)',
  border: `1px solid ${active ? 'var(--bg-selected)' : 'var(--border-md)'}`,
})

// Header toggle buttons across their columns: text only, with a pill on hover and while on (.tbtn in index.css)
const filterBtnStyle = {
  flex: 1, minWidth: 0,
  padding: '6px 4px',
  margin: 2,
  cursor: 'pointer',
  fontSize: 10,
  fontFamily: 'Roboto, sans-serif',
  textAlign: 'center',
  whiteSpace: 'nowrap',
}

const focusBtnStyle = (active, enabled) => ({
  ...colBtnStyle(active),
  ...(!enabled && {
    background: 'var(--bg-panel)',
    color: 'var(--text-3)',
    border: '1px solid var(--border)',
    cursor: 'default',
  }),
})
