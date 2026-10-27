import { useState, useEffect, useMemo } from 'react'
import { flushSync } from 'react-dom'
import useStore, { ALL_TYPES } from '../store/useStore.js'
import { LegendIcon, LEGEND_W } from './LegendIcons.jsx'
import { upstreamLayerCount } from '../utils/dependencies.js'
import { useT } from '../i18n.js'

const NODE_TYPES = ['goal', 'task', 'softgoal', 'resource']
const LINK_TYPES = ['depends-on', 'or', 'xor', 'and', 'help', 'hurt', 'make', 'break', 'needed-by', 'part-of']
const ACTOR_TYPES = ['actor']

// Minimum column widths (they fit the English labels); columns grow when a language's labels are longer
const MIN_LABEL_W = 82  // name column / Show-Hide tags buttons
const MIN_COL_I   = 88  // visibility column (Show all / Hide all)
const MIN_COL_H   = 112 // highlight column (Highlight all / Clear all)
const COL_I_PAD_L = 10  // extra room between the divider and the visibility column
const PANEL_CHROME = 50 // panel padding (2 × 12) + card border (2) + card padding (2 × 12)
const BTN_CHROME  = 22  // header button padding (2 × 10) + border (2)

// Width of `text` in the header buttons' font
let measureCtx = null
function buttonTextW(text) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  measureCtx.font = '10px monospace'
  return Math.ceil(measureCtx.measureText(text).width)
}

// Width of a classic scrollbar on this system (0 with overlay scrollbars, e.g. macOS default)
const SCROLLBAR_W = (() => {
  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll'
  document.body.appendChild(el)
  const w = el.offsetWidth - el.clientWidth
  el.remove()
  return w
})()
const LEGEND_GAP = 6  // space between legend icon and checkbox
const SQUARE = 16

// Shared column styles so header buttons and row checkboxes line up exactly. Widths fit the current
// language's button labels; with the legend on, columns grow just enough for checkbox + legend icon.
const LEGEND_CONTENT = SQUARE + LEGEND_GAP + LEGEND_W
function useColumns() {
  const t = useT()
  return useMemo(() => {
    const widest = (keys) => Math.max(...keys.map(k => buttonTextW(t(k)))) + BTN_CHROME
    const label = Math.max(MIN_LABEL_W, widest(['filter.showTags', 'filter.hideTags']) + 8)
    const i = Math.max(MIN_COL_I, widest(['filter.showAll', 'filter.hideAll']) + COL_I_PAD_L + 4)
    const h = Math.max(MIN_COL_H, widest(['filter.highlightAll', 'filter.clearAll']) + 8)
    const iW = (legend) => legend ? Math.max(i, LEGEND_CONTENT + COL_I_PAD_L + 4) : i
    const hW = (legend) => legend ? Math.max(h, LEGEND_CONTENT + 8) : h
    return {
      panelWidth: (legend) => PANEL_CHROME + label + iW(legend) + hW(legend),
      colI: (legend) => ({ width: iW(legend), flexShrink: 0, borderLeft: '1px solid var(--border-lt)', padding: `0 4px 0 ${COL_I_PAD_L}px` }),
      colH: (legend) => ({ width: hW(legend), flexShrink: 0, borderLeft: '1px solid var(--border-lt)', padding: '0 4px' }),
    }
  }, [t])
}

export default function FilterPanel() {
  const t = useT()
  const { panelWidth: basePanelWidth, colI, colH } = useColumns()
  const highlightTypes      = useStore(s => s.highlightTypes)
  const isolateTypes        = useStore(s => s.isolateTypes)
  const toggleHighlightType = useStore(s => s.toggleHighlightType)
  const toggleIsolateType   = useStore(s => s.toggleIsolateType)
  const hiddenActorIds      = useStore(s => s.hiddenActorIds)
  const highlightedActorIds = useStore(s => s.highlightedActorIds)
  const setAllHighlight     = useStore(s => s.setAllHighlight)
  const setAllIsolate       = useStore(s => s.setAllIsolate)
  const focusNodeId         = useStore(s => s.focusNodeId)
  const focusDeep           = useStore(s => s.focusDeep)
  const setFocusNode        = useStore(s => s.setFocusNode)
  const focusDepth          = useStore(s => s.focusDepth)
  const setFocusDepth       = useStore(s => s.setFocusDepth)
  const selectedId          = useStore(s => s.selectedId)
  const selectedType        = useStore(s => s.selectedType)

  const legendOpen   = useStore(s => s.legendOpen)
  const toggleLegend = useStore(s => s.toggleLegend)
  const hideTags     = useStore(s => s.hideTags)
  const setHideTags    = useStore(s => s.setHideTags)

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
  const noneVisible     = isolateTypes.length === 0
  const allHighlighted  = ALL_TYPES.every(t => highlightTypes.includes(t))
  const noneHighlighted = highlightTypes.length === 0 && highlightedActorIds.length === 0

  const panelWidth = basePanelWidth(legendOpen) + (overflows ? SCROLLBAR_W : 0)

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

  return (
    <>
    <div ref={setPanelEl} style={{
      // Equal padding around the cards; when the content overflows, the panel widens by the
      // scrollbar's width so the scrollbar sits in its own strip at the edge instead of squeezing the cards
      width: panelWidth,
      borderRight: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      // Scrolling only switches on once the panel has widened, so the scrollbar never squeezes the cards
      overflowY: overflows ? 'auto' : 'hidden',
      padding: 12,
      gap: 12,
    }}>
      {/* Filter container */}
      <div ref={setFilterCardEl} style={cardStyle}>
        <div style={cardTitle}>
          {t('filter.title')}
        </div>

        {/* Legend button */}
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={toggleLegend}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: legendOpen ? 'var(--text-1)' : 'var(--node-fill)',
              color: legendOpen ? 'var(--bg-popup)' : 'var(--text-1)',
              border: '1px solid var(--border-md)',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'monospace',
              textAlign: 'left',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="1" y="2" width="11" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="1" y="5.75" width="11" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="1" y="9.5" width="11" height="1.5" rx="0.75" fill="currentColor"/>
            </svg>
            {legendOpen ? t('filter.hideLegend') : t('filter.showLegend')}
          </button>
        </div>

        {/* Column headers */}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          {/* Show / hide tags, stacked like the column buttons on the right */}
          <div style={{ flex: 1, minWidth: 0, paddingRight: 8, display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button onClick={() => setHideTags(false)} style={colBtnStyle(!hideTags)}>{t('filter.showTags')}</button>
              <button onClick={() => setHideTags(true)} style={colBtnStyle(hideTags)}>{t('filter.hideTags')}</button>
            </div>
          </div>
          <div style={{ ...colI(legendOpen), display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button onClick={() => setAllIsolate(true)} style={colBtnStyle(allVisible)}>{t('filter.showAll')}</button>
            <button onClick={() => setAllIsolate(false)} style={colBtnStyle(noneVisible)}>{t('filter.hideAll')}</button>
          </div>
          <div style={{ ...colH(legendOpen), display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button onClick={() => setAllHighlight(true)} style={colBtnStyle(allHighlighted)}>{t('filter.highlightAll')}</button>
            <button onClick={() => setAllHighlight(false)} style={colBtnStyle(noneHighlighted)}>{t('filter.clearAll')}</button>
          </div>
        </div>

        <Section label={t('filter.elements')} types={NODE_TYPES} first legend={legendOpen}
          highlightTypes={highlightTypes} isolateTypes={isolateTypes}
          onToggleH={toggleHighlightType} onToggleI={toggleIsolateType} />

        <Section label={t('filter.links')} types={LINK_TYPES} legend={legendOpen}
          highlightTypes={highlightTypes} isolateTypes={isolateTypes}
          onToggleH={toggleHighlightType} onToggleI={toggleIsolateType} />

        <Section label={t('filter.actors')} types={ACTOR_TYPES} legend={legendOpen}
          highlightTypes={highlightTypes} isolateTypes={isolateTypes}
          onToggleH={toggleHighlightType} onToggleI={toggleIsolateType} />
        <ActorListToggle open={actorPanelOpen} onToggle={() => setActorPanelOpen(o => !o)} />
      </div>

      {/* Dependencies container */}
      <div style={{ ...cardStyle, gap: 6 }}>
        <div style={cardTitle}>
          {t('deps.title')}
        </div>
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
        {/* Current status */}
        {(!canFocus || isDirectActive || isDeepActive) && (
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 2, lineHeight: 1.5 }}>
            {!canFocus
              ? t('deps.noSelection')
              : isDeepActive
              ? t('deps.showingAll')
              : layers === 1 ? t('deps.showingLayer') : t('deps.showingLayers', { n: layers })}
          </div>
        )}
      </div>

    </div>
    {actorPanelOpen && <ActorPanel left={panelWidth} onClose={() => setActorPanelOpen(false)} />}
    </>
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
      fontSize: 10, fontFamily: 'monospace', color: enabled ? 'var(--text-2)' : 'var(--text-3)' }}>
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

function SectionLabel({ first, children }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-1)', fontFamily: 'monospace', textTransform: 'uppercase', marginTop: first ? 6 : 12, marginBottom: 4,
      paddingBottom: 4, borderBottom: '1px solid var(--text-1)' }}>
      {children}
    </div>
  )
}

function Section({ label, first, legend, types, highlightTypes, isolateTypes, onToggleH, onToggleI }) {
  const t = useT()
  return (
    <>
      <SectionLabel first={first}>{label}</SectionLabel>
      {types.map(type => (
        <TypeRow
          key={type} label={t(`type.${type}`)} legendType={type} legend={legend}
          inHighlight={highlightTypes.includes(type)}
          inIsolate={isolateTypes.includes(type)}
          onToggleH={() => onToggleH(type)}
          onToggleI={() => onToggleI(type)}
        />
      ))}
    </>
  )
}

// legendType: which sample to show when the legend is on (null = blank space, keeps checkboxes aligned)
// wrap: let long labels run onto several lines instead of being cut off with "…"
function TypeRow({ label, legendType = label, wrap = false, legend, inHighlight, inIsolate, onToggleH, onToggleI }) {
  const { colI, colH } = useColumns()
  const slot = (highlighted) => !legend ? null
    : legendType ? <LegendSlot type={legendType} highlighted={highlighted} />
    : <div style={{ width: LEGEND_W, flexShrink: 0 }} />
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0' }}>
      <span title={label} style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'monospace', color: 'var(--text-1)', userSelect: 'none', textAlign: 'left', paddingRight: 8,
        ...(wrap
          ? { overflowWrap: 'anywhere', lineHeight: 1.35 }
          : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>
        {label}
      </span>
      <div style={{ ...colI(legend), display: 'flex', justifyContent: 'center', alignItems: 'center', gap: LEGEND_GAP }}>
        <Square active={inIsolate} onClick={onToggleI} />
        {slot(false)}
      </div>
      <div style={{ ...colH(legend), display: 'flex', justifyContent: 'center', alignItems: 'center', gap: LEGEND_GAP }}>
        <Square active={inHighlight} onClick={onToggleH} />
        {slot(true)}
      </div>
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

const ACTOR_PANEL_W = 340

// Side panel next to the filter panel: every actor with its own hide / highlight checkboxes
function ActorPanel({ left, onClose }) {
  const t = useT()
  const { colI, colH } = useColumns()
  const actors              = useStore(s => s.actors)
  const hiddenActorIds      = useStore(s => s.hiddenActorIds)
  const highlightedActorIds = useStore(s => s.highlightedActorIds)
  const toggleActorHidden    = useStore(s => s.toggleActorHidden)
  const toggleActorHighlight = useStore(s => s.toggleActorHighlight)
  // The "actor" type row applies to every actor, so the per-actor boxes show the combined state
  const actorsVisible       = useStore(s => s.isolateTypes.includes('actor'))
  const actorsHighlighted   = useStore(s => s.highlightTypes.includes('actor'))

  const list = Object.values(actors).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const colLabel = { fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace', textAlign: 'center' }

  return (
    <div className="panel-slide-in" style={{
      position: 'absolute', left, top: 0, bottom: 0, width: ACTOR_PANEL_W, zIndex: 150,
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
          <div style={{ ...colI(false), ...colLabel }}>{t('actors.visible')}</div>
          <div style={{ ...colH(false), ...colLabel }}>{t('actors.highlight')}</div>
        </div>

        {list.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', padding: '6px 0' }}>{t('actors.none')}</div>
        )}
        {list.map(a => (
          <TypeRow
            key={a.id} label={a.name || t('actors.unnamed')} legendType={null} legend={false} wrap
            inIsolate={actorsVisible && !hiddenActorIds.includes(a.id)}
            inHighlight={actorsHighlighted || highlightedActorIds.includes(a.id)}
            onToggleI={() => toggleActorHidden(a.id)}
            onToggleH={() => toggleActorHighlight(a.id)}
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
}

const infoText = {
  fontSize: 10, color: 'var(--text-2)', fontFamily: 'monospace', lineHeight: 1.5, marginBottom: 6,
}

const cardTitle = {
  fontSize: 13, fontWeight: 'bold', color: 'var(--text-1)', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 6,
}

const colBtn = {
  background: 'var(--node-fill)',
  border: '1px solid var(--border-md)',
  width: '100%',
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 10,
  fontFamily: 'monospace',
  color: 'var(--text-1)',
  textAlign: 'center',
  whiteSpace: 'nowrap',
}

const colBtnStyle = (active) => ({
  ...colBtn,
  background: active ? 'var(--text-1)' : 'var(--node-fill)',
  color: active ? 'var(--bg-popup)' : 'var(--text-1)',
  border: `1px solid ${active ? 'var(--text-1)' : 'var(--border-md)'}`,
})

const focusBtnStyle = (active, enabled) => ({
  ...colBtnStyle(active),
  ...(!enabled && {
    background: 'var(--bg-panel)',
    color: 'var(--text-3)',
    border: '1px solid var(--border)',
    cursor: 'default',
  }),
})
