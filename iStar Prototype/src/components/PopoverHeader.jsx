import { useT } from '../i18n.js'
import { dragHandleStyle, headerActionsStyle, toggleBtnStyle, closeBtnStyle } from './popupStyles.js'

// Popup header bar: drag handle across the top, with a hide/show toggle (and optional ×) on the right
export default function PopoverHeader({ handleRef, dragProps, collapsed, onToggle, onClose }) {
  const t = useT()
  const stop = e => e.stopPropagation()
  return (
    <>
      <div ref={handleRef} {...dragProps} style={dragHandleStyle}>
        <span style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: 3 }}>• • •</span>
      </div>
      <div style={headerActionsStyle}>
        <button onClick={onToggle} onPointerDown={stop} style={toggleBtnStyle}>
          {collapsed ? t('popup.show') : t('popup.hide')}
        </button>
        {onClose && <button onClick={onClose} onPointerDown={stop} aria-label={t('popup.close')} style={closeBtnStyle}>×</button>}
      </div>
    </>
  )
}
