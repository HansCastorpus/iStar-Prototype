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

  return (
    <div style={{
      width: 230,
      borderRight: '1px solid #ddd',
      background: '#fafafa',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflowY: 'auto',
      padding: '10px 12px',
      gap: 4,
    }}>
      <div style={{ fontSize: 11, color: '#999', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 4 }}>
        Filter
      </div>

      {/* Column headers — clickable select-all toggles */}
      <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid #eee', marginBottom: 2 }}>
        <div style={{ width: COL_H, display: 'flex', justifyContent: 'center', borderRight: '1px solid #e0e0e0', paddingRight: 4 }}>
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
    </div>
  )
}

function Section({ label, types, highlightTypes, isolateTypes, onToggleH, onToggleI }) {
  return (
    <>
      <div style={{ fontSize: 10, color: '#aaa', fontFamily: 'monospace', textTransform: 'uppercase', marginTop: 10, marginBottom: 4 }}>
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
        borderRight: '1px solid #e0e0e0', paddingRight: 4 }}>
        <Square active={inHighlight} onClick={onToggleH} />
      </div>
      <div style={{ width: COL_I, display: 'flex', justifyContent: 'center', paddingLeft: 4 }}>
        <Square active={inIsolate} onClick={onToggleI} />
      </div>
      <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: '#333', userSelect: 'none', paddingLeft: 10 }}>
        {label}
      </span>
    </div>
  )
}

function Square({ active, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: 14, height: 14, flexShrink: 0,
      border: '1px solid #888',
      background: active ? '#222' : 'white',
      cursor: 'pointer',
    }} />
  )
}

const colBtn = {
  background: 'white',
  border: '1px solid #ccc',
  padding: '4px 6px',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'monospace',
  color: '#333',
  textAlign: 'center',
}
