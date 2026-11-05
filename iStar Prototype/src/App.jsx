import { useEffect, useState } from 'react'
import Canvas from './components/Canvas.jsx'
import Toolbar from './components/Toolbar.jsx'
import FilterPanel from './components/FilterPanel.jsx'
import TabBar from './components/TabBar.jsx'
import WorkTitle from './components/WorkTitle.jsx'
import useStore from './store/useStore.js'

// The logo container and the toolbar / tab bar to its right are separated by a diagonal: it leaves the logo
// container's top-right corner and runs down and to the right, so the tabs (lower) start further right than the
// File button (higher). The tab container uses the diagonal as its left edge, and its bottom-left corner is a curve:
// the diagonal bends into the header's bottom line, FILLET px before and after the corner.
const CURVE_W = 64          // how far right the diagonal travels from top to bottom
const TOOLBAR_INSET = 38    // where the toolbar's content starts, clear of the curve at its height
const TABS_INSET = CURVE_W + 4
const FILLET = 28

// Path of the separator in a box of the header's height. The diagonal has a curve at each end, mirror images of each
// other (the top one is the bottom one turned half a turn): at the top it comes in along the top edge from the left, at the
// bottom it leaves along the bottom line to the right. Each is a quadratic curve whose control point is the diagonal's corner.
function separatorGeometry(h) {
  const len = Math.hypot(CURVE_W, h), ux = CURVE_W / len, uy = h / len
  const y = h - 0.5
  const top = `M${-FILLET},0.5 Q0,0.5 ${ux * FILLET},${uy * FILLET}`
  const bottom = `L${CURVE_W - ux * FILLET},${y - uy * FILLET} Q${CURVE_W},${y} ${CURVE_W + FILLET},${y}`
  return {
    line: `${top} ${bottom}`,
    // Logo area: left of the line (closed along the bottom and the left edge)
    logo: `${top} ${bottom} L${CURVE_W + FILLET},${h} L${-FILLET},${h} Z`,
    // The corner the top curve cuts off the logo area: it belongs to the toolbar side
    cutoff: `M${-FILLET},0 Q0,0.5 ${ux * FILLET},${uy * FILLET} L0,0 Z`,
  }
}

export default function App() {
  const darkMode = useStore(s => s.darkMode)
  const activeModelId = useStore(s => s.activeModelId)
  const filterPanelRight = useStore(s => s.filterPanelRight)
  const filterCollapsed = useStore(s => s.filterCollapsed)

  // The logo keeps the width it had over the open filter panel, so it stays visible when that collapses
  const [headerEl, setHeaderEl] = useState(null)
  const [headerH, setHeaderH] = useState(0)
  useEffect(() => {
    if (!headerEl) return
    const ro = new ResizeObserver(() => setHeaderH(headerEl.offsetHeight))
    ro.observe(headerEl)
    return () => ro.disconnect()
  }, [headerEl])
  const [logoWidth, setLogoWidth] = useState(300)
  useEffect(() => { if (!filterCollapsed && filterPanelRight) setLogoWidth(filterPanelRight) }, [filterCollapsed, filterPanelRight])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // Load the saved project once (not per diagram: the canvas is remounted when another diagram opens)
  useEffect(() => { useStore.getState().loadFromStorage() }, [])

  const lang = useStore(s => s.lang)
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  // Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z or Ctrl+Y redo. Text fields keep their own native undo.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const el = e.target
      if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      const key = e.key.toLowerCase()
      const { undo, redo } = useStore.getState()
      if (key === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)() }
      else if (key === 'y' && !e.shiftKey) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Header: the logo has one container over the filter panel, spanning both rows; the toolbar and
          tab bar stack to its right */}
      <div ref={setHeaderEl} style={{ display: 'flex', flexShrink: 0, position: 'relative' }}>
        <div style={{
          width: filterCollapsed ? logoWidth : filterPanelRight ?? 300, flexShrink: 0, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8px 16px', background: 'var(--bg-logo)',
          borderTop: '1px solid var(--border)',  // runs into the diagonal's top curve
        }}>
          {/* Placeholder until there is a new logo (the previous one is still exported as Logo from Toolbar.jsx) */}
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: 'var(--text-1)', whiteSpace: 'nowrap', userSelect: 'none' }}>i* BUILDER</span>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Toolbar inset={TOOLBAR_INSET} />
          {/* The header's bottom line starts where the curve ends: nothing under the logo area */}
          <div style={{ position: 'relative' }}>
            <TabBar inset={TABS_INSET} />
            <div aria-hidden style={{ position: 'absolute', bottom: 0, right: 0, left: CURVE_W + FILLET, height: 1, background: 'var(--border)' }} />
          </div>
        </div>
        {/* The separator: from the logo container's top-right corner down to the header's bottom line */}
        {headerH > 0 && (
          <svg aria-hidden width={CURVE_W + FILLET} height={headerH} style={{
            position: 'absolute', top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 2,
            left: filterCollapsed ? logoWidth : filterPanelRight ?? 300,
          }}>
            {/* Everything left of the diagonal (and the corner the curve cuts off) is the logo area */}
            <path d={separatorGeometry(headerH).logo} fill="var(--bg-logo)" stroke="none" />
            <path d={separatorGeometry(headerH).cutoff} fill="var(--bg-header)" stroke="none" />
            <path d={separatorGeometry(headerH).line} fill="none" stroke="var(--border)" strokeWidth="1" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <FilterPanel />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* keyed by the open diagram so each one starts with a fresh view (zoom / pan) */}
          <Canvas key={activeModelId} />
          <WorkTitle />
        </div>
      </div>
    </div>
  )
}
