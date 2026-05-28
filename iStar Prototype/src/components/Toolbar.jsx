import { useRef } from 'react'
import useStore from '../store/useStore.js'

const MODES = [
  { id: 'select',         label: 'Select' },
  { id: 'add-goal',       label: '+ Goal' },
  { id: 'add-task',       label: '+ Task' },
  { id: 'add-softgoal',   label: '+ Softgoal' },
  { id: 'add-resource',   label: '+ Resource' },
]

export default function Toolbar() {
  const { mode, setMode, exportDiagram, importDiagram } = useStore()
  const fileRef = useRef(null)

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => importDiagram(ev.target.result)
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 8px',
      borderBottom: '1px solid #ddd',
      background: '#fafafa',
      flexShrink: 0,
    }}>
      {MODES.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => setMode(id)}
          style={{
            background: mode === id ? '#222' : 'none',
            color: mode === id ? '#fff' : '#333',
            border: '1px solid #ccc',
            padding: '3px 10px',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'monospace',
          }}
        >
          {label}
        </button>
      ))}

      <div style={{ flex: 1 }} />

      <button onClick={exportDiagram} style={actionBtn}>Export</button>
      <button onClick={() => fileRef.current.click()} style={actionBtn}>Import</button>
      <input ref={fileRef} type="file" accept=".json"
        style={{ display: 'none' }} onChange={handleImport} />
    </div>
  )
}

const actionBtn = {
  background: 'none',
  border: '1px solid #ccc',
  padding: '3px 10px',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'monospace',
}
