import { useRef, useState, useEffect } from 'react'
import useStore from '../store/useStore.js'

const MODES = [
  { id: 'select',         label: 'Select' },
  { id: 'add-goal',       label: '+ Goal' },
  { id: 'add-task',       label: '+ Task' },
  { id: 'add-softgoal',   label: '+ Softgoal' },
  { id: 'add-resource',   label: '+ Resource' },
]

function GoalShape() {
  return (
    <svg width="24" height="14" viewBox="0 0 24 14" style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }}>
      <rect x="0.5" y="0.5" width="23" height="13" rx="6.5" fill="white" stroke="#333" strokeWidth="1"/>
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="24" height="14" viewBox="0 0 24 14" style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }}>
      <line x1="2" y1="7" x2="17" y2="7" stroke="#333" strokeWidth="1.2"/>
      <polygon points="17,4 22,7 17,10" fill="#333"/>
    </svg>
  )
}

function TagIcon() {
  return (
    <svg width="32" height="14" viewBox="0 0 32 14" style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }}>
      <rect x="0.5" y="0.5" width="31" height="13" rx="6.5" fill="white" stroke="#333" strokeWidth="1"/>
      <text x="16" y="7.5" textAnchor="middle" dominantBaseline="middle" fontSize="7" fontFamily="sans-serif" fill="#333">AND</text>
    </svg>
  )
}

const STEPS = [
  <>Add intentional elements <GoalShape /> by clicking the + buttons.</>,
  <>Add information from the popup that appears. You can also modify the type of the element <GoalShape /> by clicking on the element <GoalShape />.</>,
  <>Select two intentional elements <GoalShape /> to choose the link <ArrowIcon /> that defines their relationship. The order of the selection defines the direction of the link <ArrowIcon />. You can change the link's type and direction by clicking on the link <ArrowIcon />.</>,
  <>For the links <ArrowIcon />, the path is created along an octilinear grid.</>,
  <>You can slide the information tags <TagIcon /> on the link to improve readability.</>,
  <>If a long link <ArrowIcon /> is having trouble drawing a clean path, you can click on the link <ArrowIcon /> and enable an outer path from the popup. A direction (left, right, top, bottom) can also be set to control which side of the diagram the path goes around.</>,
]

export default function Toolbar() {
  const { mode, setMode, exportDiagram, importDiagram, clearDiagram, exportAsImage } = useStore()
  const fileRef  = useRef(null)
  const helpRef  = useRef(null)
  const timerRef = useRef(null)
  const [armed,    setArmed]    = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

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
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 8px',
      borderBottom: '1px solid #ddd',
      background: '#fafafa',
      flexShrink: 0,
    }}>
      {/* Title */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#333' }}>iStar Prototype</span>
      </div>

      {/* Centered mode buttons */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>

        {/* Help button */}
        <div ref={helpRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setHelpOpen(v => !v)}
            style={{
              background: helpOpen ? '#222' : 'none',
              color: helpOpen ? '#fff' : '#333',
              border: '1px solid #ccc',
              padding: '5px 9px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
              <text x="6.5" y="7" textAnchor="middle" dominantBaseline="middle"
                fontSize="7.5" fontFamily="serif" fontStyle="italic" fill="currentColor">i</text>
            </svg>
          </button>

          {helpOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              background: 'white',
              border: '1px solid #ccc',
              padding: '14px 18px',
              paddingTop: 10,
              zIndex: 300,
              width: 380,
              fontFamily: 'monospace',
              fontSize: 12,
              color: '#333',
              lineHeight: 1.7,
            }}>
              <button
                onClick={() => setHelpOpen(false)}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 8,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: '#999',
                  lineHeight: 1,
                  padding: '2px 4px',
                }}
              >×</button>
              <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {STEPS.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </div>
          )}
        </div>

        {MODES.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            style={{
              background: mode === id ? '#222' : 'none',
              color: mode === id ? '#fff' : '#333',
              border: '1px solid #ccc',
              padding: '5px 14px',
              cursor: 'pointer',
              fontSize: 13,
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
            <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#c00' }}>Wipe canvas?</span>
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
  padding: '5px 14px',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'monospace',
}
