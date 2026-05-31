import useStore from '../store/useStore.js'

const NODE_TYPES = ['goal', 'task', 'softgoal', 'resource']
const LINK_TYPES = ['depends-on', 'or', 'xor', 'and', 'help', 'hurt', 'make', 'break', 'needed-by', 'part-of']

const COL_H = 64   // width of Highlight column
const COL_I = 48   // width of Hide column

export default function FilterPanel() {
  const highlightTypes      = useStore(s => s.highlightTypes)
  const isolateTypes        = useStore(s => s.isolateTypes)
  const toggleHighlightType = useStore(s => s.toggleHighlightType)
  const toggleIsolateType   = useStore(s => s.toggleIsolateType)
  const toggleAllHighlight  = useStore(s => s.toggleAllHighlight)
  const toggleAllIsolate    = useStore(s => s.toggleAllIsolate)
  const focusNodeId         = useStore(s => s.focusNodeId)
  const focusDeep           = useStore(s => s.focusDeep)
  const setFocusNode        = useStore(s => s.setFocusNode)
  const selectedId          = useStore(s => s.selectedId)
  const selectedType        = useStore(s => s.selectedType)

  const canFocus       = selectedType === 'node' && !!selectedId
  const isDirectActive = !!focusNodeId && focusNodeId === selectedId && !focusDeep
  const isDeepActive   = !!focusNodeId && focusNodeId === selectedId && focusDeep

  return (
    <div style={{
      width: 230,
      borderRight: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflowY: 'auto',
      padding: '10px 12px',
      gap: 4,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 4 }}>
        Filter
      </div>

      {/* Column headers */}
      <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid var(--border-lt)', marginBottom: 2 }}>
        <div style={{ width: COL_H, display: 'flex', justifyContent: 'center', borderRight: '1px solid var(--border-lt)', paddingRight: 4 }}>
          <button onClick={toggleAllHighlight} style={colBtn}>Highlight</button>
        </div>
        <div style={{ width: COL_I, display: 'flex', justifyContent: 'center', paddingLeft: 4 }}>
          <button onClick={toggleAllIsolate} style={colBtn}>Hide</button>
        </div>
      </div>

      <Section label="Nodes" types={NODE_TYPES}
        highlightTypes={highlightTypes} isolateTypes={isolateTypes}
        onToggleH={toggleHighlightType} onToggleI={toggleIsolateType} />

      <Section label="Links" types={LINK_TYPES}
        highlightTypes={highlightTypes} isolateTypes={isolateTypes}
        onToggleH={toggleHighlightType} onToggleI={toggleIsolateType} />

      {/* Focus section */}
      <div style={{ borderTop: '1px solid var(--border-lt)', marginTop: 14, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={() => canFocus && setFocusNode(selectedId, false)}
          style={focusBtnStyle(isDirectActive, canFocus)}
        >
          {isDirectActive ? 'Clear focus' : 'Highlight relationships'}
        </button>
        <button
          onClick={() => canFocus && setFocusNode(selectedId, true)}
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
  )
}

function Section({ label, types, highlightTypes, isolateTypes, onToggleH, onToggleI }) {
  return (
    <>
      <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', textTransform: 'uppercase', marginTop: 10, marginBottom: 4 }}>
        {label}
      </div>
      {types.map(t => (
        <TypeRow
          key={t} label={t}
          inHighlight={highlightTypes.includes(t)}
          inIsolate={isolateTypes.includes(t)}
          onToggleH={() => onToggleH(t)}
          onToggleI={() => onToggleI(t)}
        />
      ))}
    </>
  )
}

function TypeRow({ label, inHighlight, inIsolate, onToggleH, onToggleI }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0' }}>
      <div style={{ width: COL_H, display: 'flex', justifyContent: 'center',
        borderRight: '1px solid var(--border-lt)', paddingRight: 4 }}>
        <Square active={inHighlight} onClick={onToggleH} />
      </div>
      <div style={{ width: COL_I, display: 'flex', justifyContent: 'center', paddingLeft: 4 }}>
        <Square active={inIsolate} onClick={onToggleI} />
      </div>
      <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: 'var(--text-1)', userSelect: 'none', paddingLeft: 10 }}>
        {label}
      </span>
    </div>
  )
}

function Square({ active, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: 14, height: 14, flexShrink: 0,
      border: '1px solid var(--border-ck)',
      background: active ? 'var(--text-1)' : 'var(--node-fill)',
      cursor: 'pointer',
    }} />
  )
}

const colBtn = {
  background: 'var(--node-fill)',
  border: '1px solid var(--border-md)',
  padding: '4px 6px',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'monospace',
  color: 'var(--text-1)',
  textAlign: 'center',
}

const focusBtnStyle = (active, enabled) => ({
  width: '100%',
  background: active ? 'var(--text-1)' : enabled ? 'var(--node-fill)' : 'var(--bg-panel)',
  color: active ? 'var(--bg-popup)' : enabled ? 'var(--text-1)' : 'var(--text-3)',
  border: `1px solid ${active ? 'var(--text-1)' : enabled ? 'var(--border-md)' : 'var(--border)'}`,
  padding: '6px 10px',
  cursor: enabled ? 'pointer' : 'default',
  fontSize: 11,
  fontFamily: 'monospace',
  textAlign: 'left',
})
