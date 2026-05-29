import useStore, { ALL_TYPES } from '../store/useStore.js'

const NODE_TYPES = ['goal', 'task', 'softgoal', 'resource']
const LINK_TYPES = ['depends-on', 'or', 'xor', 'and', 'help', 'hurt', 'make', 'break', 'needed-by', 'part-of']

export default function FilterPanel() {
  const filterMode    = useStore(s => s.filterMode)
  const filterTypes   = useStore(s => s.filterTypes)
  const setFilterMode = useStore(s => s.setFilterMode)
  const toggleFilterType = useStore(s => s.toggleFilterType)

  const isActive = (type) => !filterTypes || filterTypes.includes(type)

  const selectAll  = () => useStore.setState({ filterTypes: [...ALL_TYPES] })
  const selectNone = () => useStore.setState({ filterTypes: [] })

  return (
    <div style={{
      width: 148,
      borderRight: '1px solid #ddd',
      background: '#fafafa',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      flexShrink: 0,
      overflowY: 'auto',
      padding: '6px 8px',
    }}>
      <div style={{ fontSize: 9, color: '#999', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 2 }}>
        Filter
      </div>

      {/* Mode buttons */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {['highlight', 'isolate'].map(m => (
          <button
            key={m}
            onClick={() => setFilterMode(m)}
            style={{
              flex: 1,
              background: filterMode === m ? '#222' : 'none',
              color: filterMode === m ? '#fff' : '#555',
              border: '1px solid #ccc',
              padding: '3px 4px',
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: 'monospace',
              textTransform: 'uppercase',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {filterMode !== 'off' && (
        <>
          {/* Select all / none */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button onClick={selectAll}  style={selBtn}>All</button>
            <button onClick={selectNone} style={selBtn}>None</button>
          </div>

          <Section label="Nodes" types={NODE_TYPES} isActive={isActive} onToggle={toggleFilterType} />
          <Section label="Links" types={LINK_TYPES} isActive={isActive} onToggle={toggleFilterType} />
        </>
      )}
    </div>
  )
}

function Section({ label, types, isActive, onToggle }) {
  return (
    <>
      <div style={{ fontSize: 9, color: '#aaa', fontFamily: 'monospace', textTransform: 'uppercase', marginTop: 6, marginBottom: 2 }}>
        {label}
      </div>
      {types.map(t => (
        <TypeToggle key={t} label={t} active={isActive(t)} onToggle={() => onToggle(t)} />
      ))}
    </>
  )
}

function TypeToggle({ label, active, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 0' }}
    >
      <div style={{
        width: 10, height: 10, flexShrink: 0,
        border: '1px solid #888',
        background: active ? '#222' : 'white',
      }} />
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#333', userSelect: 'none' }}>
        {label}
      </span>
    </div>
  )
}

const selBtn = {
  flex: 1,
  background: 'none',
  border: '1px solid #ccc',
  padding: '2px 0',
  cursor: 'pointer',
  fontSize: 10,
  fontFamily: 'monospace',
  color: '#555',
}
