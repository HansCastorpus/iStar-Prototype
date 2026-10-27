import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import useStore, { ALL_TYPES } from '../store/useStore.js'
import { LegendIcon, LEGEND_W } from './LegendIcons.jsx'

const NODE_TYPES = ['goal', 'task', 'softgoal', 'resource']
const LINK_TYPES = ['depends-on', 'or', 'xor', 'and', 'help', 'hurt', 'make', 'break', 'needed-by', 'part-of']
const ACTOR_TYPES = ['actor']

const COL_H = 112  // width of Highlight column
const COL_I = 88   // width of Hide column
const COL_I_PAD_L = 10  // extra room between the divider and the Hide column

const PANEL_W = 332

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

// Shared column styles so header buttons and row checkboxes line up exactly;
// columns only grow as much as needed to fit checkbox + legend icon when the legend is on
const LEGEND_CONTENT = SQUARE + LEGEND_GAP + LEGEND_W
const colIWidth = (legend) => legend ? Math.max(COL_I, LEGEND_CONTENT + COL_I_PAD_L + 4) : COL_I
const colHWidth = (legend) => legend ? Math.max(COL_H, LEGEND_CONTENT + 8) : COL_H
const legendExtra = (legend) => colIWidth(legend) - COL_I + colHWidth(legend) - COL_H
const colI = (legend) => ({ width: colIWidth(legend), flexShrink: 0, borderLeft: '1px solid var(--border-lt)', padding: `0 4px 0 ${COL_I_PAD_L}px` })
const colH = (legend) => ({ width: colHWidth(legend), flexShrink: 0, borderLeft: '1px solid var(--border-lt)', padding: '0 4px' })

export default function FilterPanel() {
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
  const selectedId          = useStore(s => s.selectedId)
  const selectedType        = useStore(s => s.selectedType)

  const legendOpen   = useStore(s => s.legendOpen)
  const toggleLegend = useStore(s => s.toggleLegend)
  const hideTags     = useStore(s => s.hideTags)
  const toggleHideTags = useStore(s => s.toggleHideTags)

  const canFocus       = selectedType === 'node' && !!selectedId
  const isDirectActive = !!focusNodeId && focusNodeId === selectedId && !focusDeep
  const isDeepActive   = !!focusNodeId && focusNodeId === selectedId && focusDeep

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

  const panelWidth = PANEL_W + legendExtra(legendOpen) + (overflows ? SCROLLBAR_W : 0)

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
      <div style={cardStyle}>
        <div style={cardTitle}>
          Filter
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
            {legendOpen ? 'Hide legend' : 'Show legend'}
          </button>
        </div>

        {/* Column headers */}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
            <button onClick={toggleHideTags} style={{ ...colBtnStyle(hideTags), width: 'auto' }}>Tags</button>
          </div>
          <div style={{ ...colI(legendOpen), display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button onClick={() => setAllIsolate(true)} style={colBtnStyle(allVisible)}>Show all</button>
            <button onClick={() => setAllIsolate(false)} style={colBtnStyle(noneVisible)}>Hide all</button>
          </div>
          <div style={{ ...colH(legendOpen), display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button onClick={() => setAllHighlight(true)} style={colBtnStyle(allHighlighted)}>Highlight all</button>
            <button onClick={() => setAllHighlight(false)} style={colBtnStyle(noneHighlighted)}>Clear all</button>
          </div>
        </div>

        <Section label="Nodes" types={NODE_TYPES} first legend={legendOpen}
          highlightTypes={highlightTypes} isolateTypes={isolateTypes}
          onToggleH={toggleHighlightType} onToggleI={toggleIsolateType} />

        <Section label="Links" types={LINK_TYPES} legend={legendOpen}
          highlightTypes={highlightTypes} isolateTypes={isolateTypes}
          onToggleH={toggleHighlightType} onToggleI={toggleIsolateType} />

        <Section label="Actors" types={ACTOR_TYPES} legend={legendOpen}
          highlightTypes={highlightTypes} isolateTypes={isolateTypes}
          onToggleH={toggleHighlightType} onToggleI={toggleIsolateType} />
        <ActorListToggle open={actorPanelOpen} onToggle={() => setActorPanelOpen(o => !o)} />
      </div>

      {/* Dependencies container */}
      <div style={{ ...cardStyle, gap: 6 }}>
        <div style={cardTitle}>
          Dependencies
        </div>
        <button
          onClick={() => canFocus && setFocusNode(selectedId, false)}
          disabled={!canFocus}
          style={focusBtnStyle(isDirectActive, canFocus)}
        >
          {isDirectActive ? 'Clear focus' : 'Highlight relationships'}
        </button>
        <button
          onClick={() => canFocus && setFocusNode(selectedId, true)}
          disabled={!canFocus}
          style={focusBtnStyle(isDeepActive, canFocus)}
        >
          {isDeepActive ? 'Clear focus' : 'Highlight all dependencies'}
        </button>
        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 2, lineHeight: 1.5 }}>
          {!canFocus
            ? 'Select an element to explore its dependencies.'
            : isDeepActive
            ? 'Showing full upstream dependency chain.'
            : isDirectActive
            ? 'Showing direct dependencies only.'
            : 'Highlight direct or all upstream dependencies of the selected element.'}
        </div>
      </div>

    </div>
    {actorPanelOpen && <ActorPanel left={panelWidth} onClose={() => setActorPanelOpen(false)} />}
    </>
  )
}

function SectionLabel({ first, children }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', textTransform: 'uppercase', marginTop: first ? 4 : 10, marginBottom: 4 }}>
      {children}
    </div>
  )
}

function Section({ label, first, legend, types, highlightTypes, isolateTypes, onToggleH, onToggleI }) {
  return (
    <>
      <SectionLabel first={first}>{label}</SectionLabel>
      {types.map(t => (
        <TypeRow
          key={t} label={t} legend={legend}
          inHighlight={highlightTypes.includes(t)}
          inIsolate={isolateTypes.includes(t)}
          onToggleH={() => onToggleH(t)}
          onToggleI={() => onToggleI(t)}
        />
      ))}
    </>
  )
}

// legendType: which sample to show when the legend is on (null = blank space, keeps checkboxes aligned)
// wrap: let long labels run onto several lines instead of being cut off with "…"
function TypeRow({ label, legendType = label, wrap = false, legend, inHighlight, inIsolate, onToggleH, onToggleI }) {
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
  const count = useStore(s => Object.keys(s.actors).length)
  return (
    <button onClick={onToggle} disabled={!count} aria-expanded={open}
      style={{ ...colBtnStyle(open), width: '100%', marginTop: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', fontSize: 11, textAlign: 'left',
        ...(!count && { color: 'var(--text-3)', cursor: 'default' }) }}>
      <span>{count ? `Each actor (${count})` : 'No actors yet'}</span>
      {count > 0 && <span aria-hidden>{open ? '◂' : '▸'}</span>}
    </button>
  )
}

const ACTOR_PANEL_W = 340

// Side panel next to the filter panel: every actor with its own hide / highlight checkboxes
function ActorPanel({ left, onClose }) {
  const actors              = useStore(s => s.actors)
  const hiddenActorIds      = useStore(s => s.hiddenActorIds)
  const highlightedActorIds = useStore(s => s.highlightedActorIds)
  const toggleActorHidden    = useStore(s => s.toggleActorHidden)
  const toggleActorHighlight = useStore(s => s.toggleActorHighlight)

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
          <div style={{ ...cardTitle, flex: 1, marginBottom: 0 }}>Actors</div>
          <button onClick={onClose} aria-label="Close actor panel" style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1,
            color: 'var(--text-2)', padding: '0 2px',
          }}>×</button>
        </div>

        {/* Column labels, aligned with the checkbox columns */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, paddingBottom: 4, borderBottom: '1px solid var(--border-lt)' }}>
          <div style={{ flex: 1 }} />
          <div style={{ ...colI(false), ...colLabel }}>visible</div>
          <div style={{ ...colH(false), ...colLabel }}>highlight</div>
        </div>

        {list.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', padding: '6px 0' }}>No actors yet.</div>
        )}
        {list.map(a => (
          <TypeRow
            key={a.id} label={a.name || '(unnamed)'} legendType={null} legend={false} wrap
            inIsolate={!hiddenActorIds.includes(a.id)}
            inHighlight={highlightedActorIds.includes(a.id)}
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

const cardTitle = {
  fontSize: 11, color: 'var(--text-2)', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 4,
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
