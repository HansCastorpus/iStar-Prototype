import useStore from '../store/useStore.js'
import { useZoom, worldToScreen } from '../contexts/ZoomContext.jsx'
import { usePopupPlacement, diagramObstacles, segmentBounds } from '../utils/usePopupPlacement.js'
import { computePendingPath } from '../utils/routing.js'
import { useT } from '../i18n.js'
import PopupConnector, { POPUP_Z } from './PopupConnector.jsx'

const LINK_TYPES = [
  'depends-on',
  'or', 'xor', 'and',
  'help', 'hurt', 'make', 'break',
  'needed-by', 'part-of',
]

const ENDPOINT_WEIGHT = 8  // don't cover the two elements being connected
const PENDING_WEIGHT  = 4  // ...or the ghost link between them

const center = n => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })

// Small screen rect at the midpoint between the two elements being connected
function pendingAnchor(src, tgt, transform) {
  if (!src || !tgt) return null
  const a = center(src), b = center(tgt)
  const { x, y } = worldToScreen((a.x + b.x) / 2, (a.y + b.y) / 2, transform)
  return { x: x - 8, y: y - 8, w: 16, h: 16 }
}

function pendingSegments(pendingLink, src, tgt) {
  const pts = computePendingPath(src, pendingLink.sourceSide, tgt, pendingLink.targetSide)
  return pts.slice(1).map((p, i) => [pts[i], p])
}

export default function LinkTypePopup({ linkPaths = {} }) {
  const { pendingLink, nodes, confirmLink, clearConnect } = useStore()
  const { transform } = useZoom()
  const t = useT()

  const src = pendingLink && nodes[pendingLink.sourceId]
  const tgt = pendingLink && nodes[pendingLink.targetId]
  const anchor = pendingAnchor(src, tgt, transform)

  const { pos, popRef, handleRef, dragProps, connector } = usePopupPlacement({
    id: 'link-type',
    avoid: ['properties'],  // placed after the element popup, so it steps around it
    anchor,
    getObstacles: () => [
      ...diagramObstacles({ nodes, linkPaths, transform, weights: { [src.id]: ENDPOINT_WEIGHT, [tgt.id]: ENDPOINT_WEIGHT } }),
      ...pendingSegments(pendingLink, src, tgt).map(([a, b]) => ({ ...segmentBounds(a, b, transform, 6), weight: PENDING_WEIGHT })),
    ],
    resetKey: pendingLink ? `${pendingLink.sourceId}|${pendingLink.targetId}` : '',
  })

  if (!pendingLink || !anchor) return null

  return (
    <>
    <PopupConnector connector={connector} pos={pos} />
    <div ref={popRef} style={{
      position: 'absolute',
      left: pos.x,
      top: pos.y,
      background: 'var(--bg-popup)',
      border: '1px solid var(--border-md)',
      padding: '6px',
      paddingTop: 22,
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
      zIndex: POPUP_Z,
    }}>
      <div
        ref={handleRef}
        {...dragProps}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 16,
          cursor: 'grab',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid var(--border-lt)',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: 3 }}>• • •</span>
      </div>

      <div style={{ fontSize: 9, color: 'var(--text-2)', marginBottom: 2 }}>{t('linkType.title')}</div>
      {LINK_TYPES.map((type) => (
        <button
          key={type}
          onClick={() => confirmLink(type)}
          style={{
            background: 'none',
            border: '1px solid var(--border-md)',
            color: 'var(--text-1)',
            padding: '3px 8px',
            cursor: 'pointer',
            fontSize: 11,
            textAlign: 'left',
            fontFamily: 'monospace',
          }}
        >
          {t(`type.${type}`)}
        </button>
      ))}
      <button
        onClick={clearConnect}
        onPointerDown={e => e.stopPropagation()}
        style={{ background: 'none', border: 'none', color: 'var(--text-2)',
          cursor: 'pointer', fontSize: 10, marginTop: 2, fontFamily: 'monospace' }}
      >
        {t('linkType.cancel')}
      </button>
    </div>
    </>
  )
}
