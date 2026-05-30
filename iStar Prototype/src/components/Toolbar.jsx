import { useRef, useState, useEffect } from 'react'
import useStore from '../store/useStore.js'

const MODES = [
  { id: 'select',         label: 'Select' },
  { id: 'add-goal',       label: '+ Goal' },
  { id: 'add-task',       label: '+ Task' },
  { id: 'add-softgoal',   label: '+ Softgoal' },
  { id: 'add-resource',   label: '+ Resource' },
]

export default function Toolbar() {
  const { mode, setMode, exportDiagram, importDiagram, clearDiagram, exportAsImage } = useStore()
  const fileRef = useRef(null)
  const [armed, setArmed] = useState(false)
  const timerRef = useRef(null)

  const armClear = () => {
    setArmed(true)
    timerRef.current = setTimeout(() => setArmed(false), 4000)
  }

  const cancelClear = () => {
    clearTimeout(timerRef.current)
    setArmed(false)
  }

  const confirmClear = () => {
    clearTimeout(timerRef.current)
    setArmed(false)
    clearDiagram()
  }

  useEffect(() => () => clearTimeout(timerRef.current), [])

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
      {/* Left spacer */}
      <div style={{ flex: 1 }} />

      {/* Centered mode buttons */}
      <div style={{ display: 'flex', gap: 4 }}>
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
      </div>

      {/* Right actions */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 4, alignItems: 'center' }}>
        <button onClick={exportDiagram} style={actionBtn}>Export JSON</button>
        <button onClick={() => exportAsImage('png')} style={actionBtn}>PNG</button>
        <button onClick={() => exportAsImage('jpeg')} style={actionBtn}>JPEG</button>
        <button onClick={() => fileRef.current.click()} style={actionBtn}>Import</button>
        <input ref={fileRef} type="file" accept=".json"
          style={{ display: 'none' }} onChange={handleImport} />

        <div style={{ width: 1, height: 16, background: '#ddd', margin: '0 4px' }} />

        {!armed ? (
          <button onClick={armClear} style={actionBtn}>Clear</button>
        ) : (
          <>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#c00' }}>Wipe canvas?</span>
            <button onClick={confirmClear} style={{ ...actionBtn, borderColor: '#c00', color: '#c00' }}>Confirm</button>
            <button onClick={cancelClear} style={actionBtn}>Cancel</button>
          </>
        )}
      </div>
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
