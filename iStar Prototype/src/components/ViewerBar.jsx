import useStore from '../store/useStore.js'

// The header's top row when a graph is opened from a share link: no editing menus, just a note that it is view-only
// and the light / dark switch.
export default function ViewerBar({ inset = 0 }) {
  const darkMode = useStore(s => s.darkMode)
  const toggleDarkMode = useStore(s => s.toggleDarkMode)
  const text = { fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Roboto, sans-serif', whiteSpace: 'nowrap' }
  return (
    <div data-toolbar style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: 2, paddingLeft: 2 + inset, minHeight: 38,
      background: 'var(--bg-header)', flexShrink: 0,
    }}>
      <span style={{ ...text, color: 'var(--text-1)', padding: '5px 12px' }}>View only</span>
      <button onClick={toggleDarkMode} className="tbtn" style={{ ...text, marginLeft: 'auto', padding: '5px 12px', cursor: 'pointer' }}>
        {darkMode ? 'Light' : 'Dark'}
      </button>
    </div>
  )
}
