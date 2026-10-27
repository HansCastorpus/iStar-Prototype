import { useState, useRef, useEffect } from 'react'
import useStore from '../store/useStore.js'
import { useZoom, worldToScreen } from '../contexts/ZoomContext.jsx'
import { usePopupPlacement, screenBounds, diagramObstacles } from '../utils/usePopupPlacement.js'
import { useT } from '../i18n.js'
import PopupConnector from './PopupConnector.jsx'
import PopoverHeader from './PopoverHeader.jsx'
import { HEADER_H, popoverStyle, labelStyle, inputStyle, summaryStyle, btnStyle, confirmOnEnter } from './popupStyles.js'

const NODE_TYPES = ['goal', 'task', 'softgoal', 'resource']
const LINK_TYPES = [
  'depends-on',
  'or', 'xor', 'and',
  'help', 'hurt', 'make', 'break',
  'needed-by', 'part-of',
]

const SEL_LINK_WEIGHT = 4 // covering the selected link matters more than other links

// Point halfway along a polyline
function pathMidpoint(points) {
  const segs = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let rest = segs.reduce((s, l) => s + l, 0) / 2
  for (let i = 0; i < segs.length; i++) {
    if (rest <= segs[i]) {
      const t = segs[i] ? rest / segs[i] : 0
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t }
    }
    rest -= segs[i]
  }
  return points[points.length - 1]
}

// The screen rect the popup belongs to, or null when nothing usable is selected
function selectionAnchor({ selectedId, selectedIds, selectedType, nodes, links, linkPaths, transform }) {
  if (selectedIds.length > 1) {
    const sel = selectedIds.map(id => nodes[id]).filter(Boolean)
    return sel.length ? screenBounds(sel, transform) : null
  }
  if (selectedType === 'link') {
    const link = links[selectedId]
    const path = linkPaths[selectedId]
    if (!link) return null
    let mid
    if (path?.length >= 2) mid = pathMidpoint(path)
    else {
      const src = nodes[link.sourceId], tgt = nodes[link.targetId]
      if (!src || !tgt) return null
      mid = { x: (src.x + src.width / 2 + tgt.x + tgt.width / 2) / 2, y: (src.y + src.height / 2 + tgt.y + tgt.height / 2) / 2 }
    }
    const { x, y } = worldToScreen(mid.x, mid.y, transform)
    return { x: x - 8, y: y - 8, w: 16, h: 16 }
  }
  const node = nodes[selectedId]
  return node ? screenBounds([node], transform) : null
}

export default function PropertyPopover({ linkPaths = {} }) {
  const { selectedId, selectedType, nodes, links, actors,
    updateNode, updateLink, deleteNode, deleteLink, reverseLink, ensureActor, deselect } = useStore()
  const selectedIds = useStore(s => s.selectedIds)
  const { transform } = useZoom()
  const t = useT()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [collapsed, setCollapsed] = useState(false)  // kept across selections so a minimized popup stays out of the way

  // Label edits are one undo step per editing session. The session also ends if the popup switches
  // element or closes while the field is focused (blur isn't guaranteed when the field is removed).
  const labelBatchOpen = useRef(false)
  const startLabelEdit = () => {
    if (labelBatchOpen.current) return
    labelBatchOpen.current = true
    useStore.getState().beginBatch()
  }
  const endLabelEdit = () => {
    if (!labelBatchOpen.current) return
    labelBatchOpen.current = false
    useStore.getState().endBatch()
  }
  useEffect(() => endLabelEdit, [selectedId])

  const anchor = selectionAnchor({ selectedId, selectedIds, selectedType, nodes, links, linkPaths, transform })
  const { pos, popRef, handleRef, dragProps, connector } = usePopupPlacement({
    id: 'properties',
    anchor,
    getObstacles: () => diagramObstacles({ nodes, linkPaths, transform, weights: { [selectedId]: SEL_LINK_WEIGHT } }),
    resetKey: `${selectedId}|${selectedIds.join(',')}`,
  })

  const header = (onClose) => (
    <PopoverHeader
      handleRef={handleRef}
      dragProps={dragProps}
      collapsed={collapsed}
      onToggle={() => setCollapsed(c => !c)}
      onClose={onClose}
    />
  )

  // Positioned shell shared by all popup variants, with a connector back to the selection
  const frame = (children) => (
    <>
      <PopupConnector connector={connector} pos={pos} />
      <div ref={popRef} style={{ ...popoverStyle(pos.x, pos.y), paddingTop: HEADER_H + 4 }}>
        {children}
      </div>
    </>
  )

  if ((!selectedId && selectedIds.length === 0) || !anchor) return null

  // ── Multi-select popup ───────────────────────────────────────────────────────
  if (selectedIds.length > 1) {
    const selectedNodes = selectedIds.map(id => nodes[id]).filter(Boolean)
    if (selectedNodes.length === 0) return null

    const actorIds = [...new Set(selectedNodes.map(n => n.actorId))]
    const commonActorName = actorIds.length === 1 && actorIds[0]
      ? actors[actorIds[0]]?.name ?? '' : ''
    const actorNames = Object.values(actors).map(a => a.name)

    const handleMultiActorChange = (e) => {
      const name = e.target.value.trim()
      const { beginBatch, endBatch } = useStore.getState()
      beginBatch()  // creating the actor + assigning every element is one undo step
      const actorId = name ? ensureActor(name) : null
      for (const id of selectedIds) updateNode(id, { actorId })
      endBatch()
    }

    return frame(<>
        {header()}
        <div style={{ fontSize: 9, color: '#aaa', marginBottom: 2, fontFamily: 'monospace' }}>
          {t('popup.selected', { n: selectedIds.length })}
        </div>
        {!collapsed && <>
        <label style={labelStyle}>{t('popup.actor')}</label>
        <input
          key={selectedIds.join(',')}
          list="actor-list-multi"
          defaultValue={commonActorName}
          onBlur={handleMultiActorChange}
          onKeyDown={confirmOnEnter}
          style={inputStyle}
          placeholder={actorIds.length > 1 ? t('popup.mixed') : t('popup.actorPlaceholder')}
        />
        <datalist id="actor-list-multi">
          {actorNames.map(n => <option key={n} value={n} />)}
        </datalist>
        </>}
    </>)
  }

  if (selectedType === 'link') {
    const link = links[selectedId]
    if (!link) return null
    return frame(<>
        {header()}
        {collapsed ? (
          <div style={summaryStyle}>{t(`type.${link.type}`)}</div>
        ) : <>
        <label style={labelStyle}>{t('popup.type')}</label>
        <select
          value={link.type}
          onChange={e => updateLink(selectedId, { type: e.target.value })}
          style={inputStyle}
        >
          {LINK_TYPES.map(type => <option key={type} value={type}>{t(`type.${type}`)}</option>)}
        </select>

        <button
          onClick={() => reverseLink(selectedId)}
          style={{ ...btnStyle('#555'), marginTop: 4 }}
        >
          {t('popup.reverse')}
        </button>

        <button
          onClick={() => updateLink(selectedId, { outerRoute: !link.outerRoute, outerRouteSide: null })}
          style={{ ...btnStyle(link.outerRoute ? '#1a7' : '#555'), marginTop: 2 }}
        >
          {link.outerRoute ? t('popup.outerRouteOn') : t('popup.outerRoute')}
        </button>

        {link.outerRoute && (
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            {['left', 'right', 'top', 'bottom'].map(side => (
              <button
                key={side}
                onClick={() => updateLink(selectedId, {
                  outerRouteSide: link.outerRouteSide === side ? null : side,
                })}
                style={btnStyle(link.outerRouteSide === side ? '#1a7' : '#888')}
              >
                {t(`popup.side.${side}`)}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 4 }}>
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => deleteLink(selectedId)} style={btnStyle('#c00')}>{t('popup.delete')}</button>
              <button onClick={() => setConfirmDelete(false)} style={btnStyle('#888')}>{t('popup.cancel')}</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={btnStyle('#c00')}>
              {t('popup.deleteLink')}
            </button>
          )}
        </div>
        </>}
    </>)
  }

  const node = nodes[selectedId]
  if (!node) return null

  const actorName = node.actorId ? actors[node.actorId]?.name ?? '' : ''
  const actorNames = Object.values(actors).map((a) => a.name)

  const handleLabelChange = (e) => {
    updateNode(node.id, { label: e.target.value })
  }

  const handleTypeChange = (e) => {
    updateNode(node.id, { type: e.target.value })
  }

  const handleActorChange = (e) => {
    const name = e.target.value.trim()
    if (!name) {
      updateNode(node.id, { actorId: null })
      return
    }
    const { beginBatch, endBatch } = useStore.getState()
    beginBatch()  // creating the actor + assigning it is one undo step
    const actorId = ensureActor(name)
    updateNode(node.id, { actorId })
    endBatch()
  }

  return frame(<>
      {header(deselect)}
      {collapsed ? (
        <div style={summaryStyle}>{node.label || t(`type.${node.type}`)}</div>
      ) : <>
      <label style={labelStyle}>{t('popup.label')}</label>
      <input
        autoFocus
        value={node.label}
        onChange={handleLabelChange}
        onFocus={startLabelEdit}
        onBlur={endLabelEdit}
        onKeyDown={confirmOnEnter}
        style={inputStyle}
        placeholder={t('popup.labelPlaceholder')}
      />

      <label style={labelStyle}>{t('popup.type')}</label>
      <select value={node.type} onChange={handleTypeChange} style={inputStyle}>
        {NODE_TYPES.map((type) => <option key={type} value={type}>{t(`type.${type}`)}</option>)}
      </select>

      <label style={labelStyle}>{t('popup.actor')}</label>
      <input
        list="actor-list"
        defaultValue={actorName}
        onBlur={handleActorChange}
        onKeyDown={confirmOnEnter}
        style={inputStyle}
        placeholder={t('popup.actorPlaceholder')}
      />
      <datalist id="actor-list">
        {actorNames.map((n) => <option key={n} value={n} />)}
      </datalist>

      <div style={{ marginTop: 6 }}>
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => deleteNode(node.id)} style={btnStyle('#c00')}>
              {t('popup.confirmDelete')}
            </button>
            <button onClick={() => setConfirmDelete(false)} style={btnStyle('#888')}>
              {t('popup.cancel')}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={btnStyle('#c00')}>
            {t('popup.deleteElement')}
          </button>
        )}
      </div>
      </>}
  </>)
}
