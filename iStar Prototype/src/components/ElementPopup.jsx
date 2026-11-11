import { useState } from 'react'
import useStore from '../store/useStore.js'
import { useZoom } from '../contexts/ZoomContext.jsx'
import { usePopupPlacement, screenBounds, diagramObstacles } from '../utils/usePopupPlacement.js'
import { useT } from '../i18n.js'
import { actorTintVar } from '../utils/actorTree.js'
import { isWebUrl, isImageSrc } from '../utils/elementDetails.js'
import PopupConnector from './PopupConnector.jsx'
import PopoverHeader from './PopoverHeader.jsx'
import { HEADER_H, popoverStyle } from './popupStyles.js'
import { HIGHLIGHT_STYLES } from '../utils/linkStyles.js'
import { LinkGlyph } from './LinkIcons.jsx'

// The viewer's popup for a clicked element. The element on the graph is the recap (its text is already there, so the popup
// doesn't repeat it); this is where the rest lives: the related actors, the text, the positive and negative aspects, links, and
// at the bottom the pictures as a carousel. A second column lists the elements linked to this one: their type, their text and the
// link between them. A section
// that has nothing in it is not shown. The information is filled in the Excel sheet or in the editor (utils/elementDetails.js).
const POPUP_W = 340
const COLUMN_W = 250      // the second column: the elements linked to this one
const COLUMN_GAP = 16
const SEL_WEIGHT = 4  // covering the selected element matters more than other elements

const font = 'Roboto, sans-serif'
const sectionLabel = { fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: font, marginBottom: 4 }
const body = { fontSize: 14, lineHeight: 1.5, color: 'var(--text-1)', fontFamily: font }
const lines = (text) => String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

export default function ElementPopup({ linkPaths }) {
  const t = useT()
  const nodes = useStore(s => s.nodes)
  const actors = useStore(s => s.actors)
  const zones = useStore(s => s.zones)
  const selectedId = useStore(s => s.selectedId)
  const selectedIds = useStore(s => s.selectedIds)
  const selectedType = useStore(s => s.selectedType)
  const allLinks = useStore(s => s.links)
  const deselect = useStore(s => s.deselect)
  const select = useStore(s => s.select)
  const { transform } = useZoom()
  const [collapsed, setCollapsed] = useState(false)  // kept across selections, like the editor's popup

  const node = selectedType === 'node' && selectedIds.length === 0 ? nodes[selectedId] : null
  const anchor = node ? screenBounds([node], transform) : null
  const { pos, popRef, handleRef, dragProps, connector } = usePopupPlacement({
    id: 'element-info',
    anchor,
    getObstacles: () => diagramObstacles({ nodes, linkPaths, transform, weights: { [selectedId]: SEL_WEIGHT } }),
    resetKey: selectedId,
    centered: true,
  })
  if (!node || !anchor || node.type === 'subactor') return null

  const d = node.details ?? {}
  const own = node.actorId ? actors[node.actorId] : null
  const related = (d.connected ?? []).filter(name => name && name !== own?.name)
  const positive = lines(d.positive), negative = lines(d.negative)
  const zoneNames = (node.zoneIds ?? []).map(id => zones[id]?.name).filter(Boolean)
  const infoText = d.description?.trim() || node.label?.trim()  // no description given: the element's own text
  const links = (d.links ?? []).filter(l => isWebUrl(l.url))
  const images = (d.images ?? []).filter(isImageSrc)
  const title = node.label || t(`type.${node.type}`)

  // The elements linked to this one, and how: links that leave it first, then the ones that arrive, each by type and text
  const connections = Object.values(allLinks)
    .filter(l => l.sourceId === node.id || l.targetId === node.id)
    .map(l => {
      const outgoing = l.sourceId === node.id
      const other = nodes[outgoing ? l.targetId : l.sourceId]
      return other && { id: l.id, outgoing, type: l.type, other }
    })
    .filter(Boolean)
    .sort((a, b) => (b.outgoing - a.outgoing) || a.type.localeCompare(b.type) || (a.other.label ?? '').localeCompare(b.other.label ?? ''))
  const twoColumns = !collapsed && connections.length > 0

  return (
    <>
      <PopupConnector connector={connector} pos={pos} />
      <div ref={popRef} role="dialog" aria-label={title} style={{
        ...popoverStyle(pos.x, pos.y), width: twoColumns ? POPUP_W + COLUMN_GAP + COLUMN_W : POPUP_W, minWidth: 0, boxSizing: 'border-box', padding: 14, paddingTop: HEADER_H + 10,
        gap: 0, maxHeight: 'calc(100% - 24px)', overflow: 'hidden', boxShadow: '0 4px 18px rgba(0, 0, 0, 0.18)',
      }}>
        <PopoverHeader handleRef={handleRef} dragProps={dragProps} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} onClose={deselect}
          left={(
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: font, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-1)' }}>
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: 3, background: `var(--hl-${node.type})`, border: '1px solid var(--border-md)' }} />
              {t(`type.${node.type}`)}
            </span>
          )} />
        <div style={{ overflowY: 'auto', overflowX: 'hidden', minHeight: 0, display: 'flex', alignItems: 'flex-start', gap: COLUMN_GAP }}>
          <div style={{ width: POPUP_W - 30, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>  {/* 30 = 2 × padding (14) + the border */}
          {!collapsed && <>
            {own && (
              <div>
                <div style={sectionLabel}>{t('info.actor')}</div>
                <span style={{ ...body, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-md)', borderRadius: 999, padding: '2px 10px', background: 'var(--node-fill)' }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 3, background: actorTintVar(actors, own.id) }} />{own.name}
                </span>
              </div>
            )}

            {node.dependum && (
              <div>
                <div style={sectionLabel}>{t('info.actor')}</div>
                <span style={{ ...body, fontSize: 13, display: 'inline-flex', border: '1px dashed var(--text-2)', borderRadius: 999, padding: '2px 10px', background: 'var(--node-fill)' }}>
                  {t('info.dependum')}
                </span>
              </div>
            )}

            {zoneNames.length > 0 && (
              <div>
                <div style={sectionLabel}>{t('info.zones')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {zoneNames.map(name => (
                    <span key={name} style={{ ...body, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e11d48', borderRadius: 999, padding: '2px 10px', background: 'rgba(225, 29, 72, 0.08)' }}>
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: '#e11d48' }} />{name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {related.length > 0 && (
              <div>
                <div style={sectionLabel}>{t(node.dependum ? 'info.involved' : 'info.connected')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {related.map(name => (
                    <span key={name} style={{ ...body, fontSize: 13, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px' }}>{name}</span>
                  ))}
                </div>
              </div>
            )}

            {infoText && (
              <div>
                <div style={sectionLabel}>{t('info.text')}</div>
                <div style={{ ...body, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{infoText}</div>
              </div>
            )}

            {positive.length > 0 && <Aspects label={t('info.positive')} items={positive} mark="+" />}
            {negative.length > 0 && <Aspects label={t('info.negative')} items={negative} mark="−" />}

            {links.length > 0 && (
              <div>
                <div style={sectionLabel}>{t('info.links')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {links.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}
                      style={{ ...body, fontSize: 13, color: 'var(--text-1)', textDecoration: 'underline', overflowWrap: 'anywhere' }}>
                      {l.label || hostOf(l.url)}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {images.length > 0 && <Carousel key={node.id} images={images} />}
          </>}
          </div>
          {twoColumns && (
            <div style={{ width: COLUMN_W, flexShrink: 0, boxSizing: 'border-box', paddingLeft: COLUMN_GAP, borderLeft: '1px solid var(--border-lt)', alignSelf: 'stretch' }}>
              <Connections items={connections} onPick={id => select(id, 'node')} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// The cards are stacked with their bodies in line; only the point of each sticks out, to the right for links that leave
// the open element and to the left for links that arrive. A card shaped like an arrow: its point is on the right when the link leaves the open element, on the left when it arrives.
const ARROW_DEPTH = 14
// A 1px line all the way round the arrow shape (the shape is clipped, so a normal border would be cut off or uneven)
const OUTLINE = ['1px 0', '-1px 0', '0 1px', '0 -1px'].map(o => `drop-shadow(${o} 0 var(--border-md))`).join(' ')
const arrowShape = (outgoing) => ({
  clipPath: outgoing
    ? `polygon(0 0, calc(100% - ${ARROW_DEPTH}px) 0, 100% 50%, calc(100% - ${ARROW_DEPTH}px) 100%, 0 100%)`
    : `polygon(${ARROW_DEPTH}px 0, 100% 0, 100% 100%, ${ARROW_DEPTH}px 100%, 0 50%)`,
})

// The elements linked to the open one. Each shows its type, its text, and the link that joins them: an arrow away from this
// element when the link leaves it, towards it when the link arrives. Pressing one opens that element instead.
function Connections({ items, onPick }) {
  const t = useT()
  return (
    <div>
      <div style={sectionLabel}>{t('info.connections')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: `1px ${ARROW_DEPTH + 1}px` }}>
        {items.map(c => (
          <button key={c.id} type="button" onClick={() => onPick(c.other.id)} title={t(c.outgoing ? 'info.outgoing' : 'info.incoming')}
            style={{ boxSizing: 'border-box', marginRight: c.outgoing ? -ARROW_DEPTH : 0, marginLeft: c.outgoing ? 0 : -ARROW_DEPTH, padding: 0, border: 'none', cursor: 'pointer', background: 'none', display: 'block', textAlign: 'left', filter: OUTLINE }}>
            <span style={{ ...arrowShape(c.outgoing), display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--node-fill)', color: 'var(--text-1)',
              padding: c.outgoing ? `7px ${ARROW_DEPTH + 6}px 7px 9px` : `7px 9px 7px ${ARROW_DEPTH + 6}px` }}>
              <span style={{ ...sectionLabel, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 3, background: `var(--hl-${c.other.type})`, border: '1px solid var(--border-md)' }} />
                {t(`type.${c.other.type}`)}
              </span>
              <span style={{ ...body, fontSize: 13, overflowWrap: 'anywhere' }}>{c.other.label || t(`type.${c.other.type}`)}</span>
              <LinkSample type={c.type} outgoing={c.outgoing} label={t(`type.${c.type}`)} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// The link as it looks on the graph when highlighted: its colour, thickness and dashes, with an arrow showing which way it goes.
function LinkSample({ type, outgoing, label }) {
  const style = HIGHLIGHT_STYLES[type]
  const color = style?.color ?? 'var(--link-def)'
  const sw = Math.min(style?.sw ?? 1.5, 6)
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 64, flexShrink: 0, display: 'flex', justifyContent: 'flex-start' }}>
        <LinkGlyph type={type} outgoing={outgoing} color={color} sw={sw} dash={style?.dash} />
      </span>
      <span style={{ fontSize: 11, fontFamily: font, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700, color }}>{label}</span>
    </span>
  )
}

function Aspects({ label, items, mark }) {
  return (
    <div>
      <div style={sectionLabel}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((item, i) => (
          <div key={i} style={{ ...body, display: 'flex', gap: 8 }}>
            <span aria-hidden style={{ width: 12, flexShrink: 0, textAlign: 'center', fontWeight: 700, color: 'var(--text-2)' }}>{mark}</span>
            <span style={{ overflowWrap: 'anywhere' }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// The pictures, one at a time, with arrows (and the arrow keys) and dots. Pictures that don't load say so instead of showing a gap.
function Carousel({ images }) {
  const t = useT()
  const [at, setAt] = useState(0)
  const [failed, setFailed] = useState({})
  const n = images.length
  const i = Math.min(at, n - 1)
  const go = (step) => setAt((i + step + n) % n)
  const arrow = (side, step, label) => (
    <button type="button" onClick={() => go(step)} aria-label={label} style={{
      position: 'absolute', top: '50%', [side]: 6, transform: 'translateY(-50%)', width: 28, height: 28, padding: 0, cursor: 'pointer',
      borderRadius: 999, border: '1px solid var(--border-md)', background: 'var(--bg-popup)', color: 'var(--text-1)', fontSize: 16, lineHeight: 1, opacity: 0.92,
    }}>{side === 'left' ? '‹' : '›'}</button>
  )
  return (
    <div tabIndex={0} aria-roledescription="carousel" aria-label={t('info.images')}
      onKeyDown={e => { if (n > 1 && e.key === 'ArrowLeft') { e.preventDefault(); go(-1) } else if (n > 1 && e.key === 'ArrowRight') { e.preventDefault(); go(1) } }}
      style={{ outline: 'none' }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        background: 'var(--node-fill)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {failed[i]
          ? <span style={{ ...body, fontSize: 12, color: 'var(--text-3)' }}>{t('info.pictureFailed')}</span>
          : <img key={i} src={images[i]} alt={t('info.picture', { n: i + 1, total: n })} loading="lazy"
              onError={() => setFailed(f => ({ ...f, [i]: true }))}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />}
        {n > 1 && arrow('left', -1, t('info.prev'))}
        {n > 1 && arrow('right', 1, t('info.next'))}
      </div>
      {n > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 8 }}>
          {images.map((_, k) => (
            <button key={k} type="button" onClick={() => setAt(k)} aria-label={t('info.picture', { n: k + 1, total: n })} aria-current={k === i}
              style={{ width: 8, height: 8, padding: 0, borderRadius: 999, cursor: 'pointer', border: '1px solid var(--text-2)', background: k === i ? 'var(--text-1)' : 'transparent' }} />
          ))}
        </div>
      )}
    </div>
  )
}
