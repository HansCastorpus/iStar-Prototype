import { POPUP_Z } from './PopupConnector.jsx'

// Styles and helpers shared by the canvas popups (element / link popup, actor popup)

// Enter confirms a text field by leaving it (actor fields save on blur; labels save as you type).
// Deferred so a highlighted autocomplete suggestion is filled in first; skipped mid-IME composition.
export function confirmOnEnter(e) {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
  const el = e.currentTarget
  setTimeout(() => el.blur())
}

export const popoverStyle = (x, y) => ({
  position: 'absolute',
  left: x,
  top: y,
  background: 'var(--bg-popup)',
  border: '1px solid var(--border-md)',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
  zIndex: POPUP_Z,
  minWidth: 230,
})

export const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text-title)', marginTop: 4 }

export const inputStyle = {
  font: 'inherit',
  fontSize: 14,
  border: '1px solid var(--border)',
  padding: '4px 7px',
  width: '100%',
  background: 'var(--node-fill)',
  color: 'var(--text-1)',
}

export const HEADER_H = 28

export const headerActionsStyle = {
  position: 'absolute', top: 0, right: 4, height: HEADER_H,
  display: 'flex', alignItems: 'center', gap: 6,
}

export const toggleBtnStyle = {
  background: 'var(--node-fill)',
  border: '1px solid var(--border-md)',
  color: 'var(--text-1)',
  padding: '2px 8px',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'Roboto Mono, monospace',
  lineHeight: 1.3,
}

export const summaryStyle = {
  fontSize: 13, color: 'var(--text-1)', fontFamily: 'Roboto Mono, monospace',
  maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

export const dragHandleStyle = {
  position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_H,
  cursor: 'grab',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderBottom: '1px solid var(--border-lt)',
  userSelect: 'none',
}

export const closeBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 18,
  color: 'var(--text-2)',
  lineHeight: 1,
  padding: 0,
}

export const btnStyle = (color) => ({
  background: 'none',
  border: `1px solid ${color}`,
  color,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'Roboto Mono, monospace',
})
