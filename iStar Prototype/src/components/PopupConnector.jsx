// Popups sit at this z-index; connectors go one below so a line never crosses any popup
export const POPUP_Z = 100

// Thin line from a popup back to the element it belongs to (coords from usePopupPlacement).
// Rendered as a sibling of the popup, not inside it, so it stays under every popup.
export default function PopupConnector({ connector, pos }) {
  if (!connector || !pos) return null
  const { x1, y1, x2, y2 } = connector
  return (
    <svg style={{ position: 'absolute', left: pos.x, top: pos.y, width: 0, height: 0, overflow: 'visible', pointerEvents: 'none', zIndex: POPUP_Z - 1 }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#bbb" strokeWidth={1} />
      <circle cx={x2} cy={y2} r={2} fill="#aaa" />
    </svg>
  )
}
