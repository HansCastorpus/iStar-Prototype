import { useRef, useState, useEffect } from 'react'
import useStore from '../store/useStore.js'

const MODES = [
  { id: 'select',         label: 'Select' },
  { id: 'add-goal',       label: '+ Goal' },
  { id: 'add-task',       label: '+ Task' },
  { id: 'add-softgoal',   label: '+ Softgoal' },
  { id: 'add-resource',   label: '+ Resource' },
]

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

const B = ({ children }) => <strong>{children}</strong>

const HELP = [
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
]

export default function Toolbar() {
  const { mode, setMode, exportDiagram, importDiagram, clearDiagram, exportAsImage, darkMode, toggleDarkMode } = useStore()
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
      gap: 8,
      padding: '4px 8px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      flexShrink: 0,
    }}>
      {/* Title */}
      <span style={{ flex: 1, fontSize: 13, fontFamily: 'monospace', color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
        iStar Prototype
      </span>

      {/* Mode buttons */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <div ref={helpRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setHelpOpen(v => !v)}
            style={{
              background: helpOpen ? 'var(--text-1)' : 'none',
              color: helpOpen ? 'var(--bg-popup)' : 'var(--text-1)',
              border: '1px solid var(--border-md)',
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
              background: 'var(--bg-popup)',
              border: '1px solid var(--border-md)',
              padding: '14px 18px',
              paddingTop: 10,
              zIndex: 300,
              width: 420,
              maxHeight: 'calc(100vh - 80px)',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: 12,
              color: 'var(--text-1)',
              lineHeight: 1.7,
            }}>
              <button
                onClick={() => setHelpOpen(false)}
                style={{
                  position: 'absolute', top: 6, right: 8,
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, color: 'var(--text-2)', lineHeight: 1, padding: '2px 4px',
                }}
              >×</button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {HELP.map(section => (
                  <section key={section.title}>
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
            {label}
          </button>
        ))}
      </div>

      <div style={separator} />

      {/* Export / Import */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button onClick={exportDiagram} style={actionBtn}>Export JSON</button>
        <button onClick={() => exportAsImage('png')} style={actionBtn}>PNG</button>
        <button onClick={() => exportAsImage('jpeg')} style={actionBtn}>JPEG</button>
        <button onClick={() => fileRef.current.click()} style={actionBtn}>Import</button>
        <input ref={fileRef} type="file" accept=".json"
          style={{ display: 'none' }} onChange={handleImport} />
      </div>

      <div style={separator} />

      {/* Dark mode + Clear */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button onClick={toggleDarkMode} style={actionBtn}>{darkMode ? '☀ Light' : '☾ Dark'}</button>
        {!armed ? (
          <button onClick={armClear} style={actionBtn}>Clear</button>
        ) : (
          <>
            <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#c00', whiteSpace: 'nowrap' }}>Wipe canvas?</span>
            <button onClick={confirmClear} style={{ ...actionBtn, borderColor: '#c00', color: '#c00' }}>Confirm</button>
            <button onClick={cancelClear} style={actionBtn}>Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}

const separator = {
  width: 1, height: 16, background: 'var(--border)', margin: '0 2px', flexShrink: 0,
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
