import { useState, useRef, useEffect, useMemo } from 'react'
import useStore from '../store/useStore.js'
import { useZoom, worldToScreen } from '../contexts/ZoomContext.jsx'
import { usePopupPlacement, screenBounds, diagramObstacles } from '../utils/usePopupPlacement.js'
import { useT } from '../i18n.js'
import { actorLayout } from '../utils/actorTree.js'
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

const blockedStyle = { fontSize: 11, color: '#c00', fontFamily: 'monospace', lineHeight: 1.4 }

// Primary actor and any nested actors of the selected element(s). Each slot has a text box (creates
// the actor if the name is new) and a drop-down of the existing actors, and a choice is applied to
// every selected element. Nested slots are stored in order on the element as `nestedActorIds`.
// With several elements a slot shows the value they share, or "mixed" when they differ.
function NodeActorFields({ selected }) {
  const t = useT()
  const actors = useStore(s => s.actors)
  const { updateNode, ensureActor, checkActorChange } = useStore()
  const [blocked, setBlocked] = useState(null)  // { slot, reason } of the last refused change
  const [nonce, setNonce] = useState(0)         // remounts the text boxes to drop a refused name
  const [slots, setSlots] = useState(0)         // empty nested slots added in this session
  const allNodes = useStore(s => s.nodes)
  const { parentOf } = useMemo(() => actorLayout(allNodes), [allNodes])
  const list = Object.values(actors)
  const ids = selected.map(n => n.id)

  // Value of a slot across the selection: the shared id, null if none has one, undefined if mixed
  const shared = (get) => {
    const vals = new Set(selected.map(n => get(n) ?? null))
    return vals.size === 1 ? [...vals][0] : undefined
  }
  const primary = shared(n => n.actorId)
  const nestedAt = (i) => shared(n => n.nestedActorIds?.[i])
  const count = Math.max(slots, ...selected.map(n => n.nestedActorIds?.length ?? 0))
  const allHavePrimary = selected.every(n => n.actorId)

  // Actors stay in their category: a primary actor is never offered as nested, and a nested actor is
  // only offered under the parent it already has. Unused actors can go either way.
  const primaryOptions = list.filter(a => a.id === primary || !parentOf[a.id])
  const nestedOptions = (i) => {
    const parent = i === 0 ? primary : nestedAt(i - 1)
    return list.filter(a => a.id === nestedAt(i) ||
      (!selected.some(n => n.actorId === a.id) &&
        (parentOf[a.id] === undefined || parent === undefined || parentOf[a.id] === parent)))
  }

  // What changing a slot does to one element
  const primaryPatch = (id) => () => ({ actorId: id })
  const nestedPatch = (i) => (id) => (node) => {
    const nested = node.nestedActorIds ?? []
    const next = Array.from({ length: Math.max(nested.length, i + 1) }, (_, k) => k === i ? id : nested[k] ?? null)
    while (next.length && next[next.length - 1] == null) next.pop()
    return { nestedActorIds: next }
  }

  // Refuses (and says why) a change that would overlap actor areas or nest an actor in two places.
  // An actor that doesn't exist yet is checked under a placeholder id.
  const attempt = (slot, id, patchFor, name = '') => {
    const reason = checkActorChange(ids, patchFor(id), id ? { [id]: name } : {})
    setBlocked(reason && { slot, reason })
    if (reason) setNonce(n => n + 1)
    return !reason
  }
  const applyAll = (patchFor, id) => {
    const { beginBatch, endBatch } = useStore.getState()
    beginBatch()  // creating the actor + assigning every element is one undo step
    const patch = patchFor(id)
    for (const n of selected) updateNode(n.id, patch(n))
    endBatch()
  }

  const field = (slot, labelKey, labelArgs, selectKey, id, patchFor, options) => {
    const shownName = id ? actors[id]?.name ?? '' : ''
    const apply = (actorId) => { if (attempt(slot, actorId, patchFor)) applyAll(patchFor, actorId) }
    const commitName = (raw) => {
      const name = raw.trim()
      if (name === shownName) return
      if (!name) return apply(null)
      const existing = list.find(a => a.name === name)
      if (existing) return apply(existing.id)
      if (!attempt(slot, `new:${slot}`, patchFor, name)) return
      const { beginBatch, endBatch } = useStore.getState()
      beginBatch()
      applyAll(patchFor, ensureActor(name))
      endBatch()
    }
    return (
      <>
        <label style={labelStyle}>{t(labelKey, labelArgs)}</label>
        <input
          key={`${id ?? ''}|${nonce}`}  // remount so the text follows a drop-down choice
          defaultValue={shownName}
          onBlur={e => commitName(e.target.value)}
          onKeyDown={confirmOnEnter}
          style={inputStyle}
          placeholder={id === undefined ? t('popup.mixed') : t('popup.actorPlaceholder')}
        />
        <label style={labelStyle}>{t(selectKey)}</label>
        <select value={id ?? ''} onChange={e => apply(e.target.value || null)} style={inputStyle}>
          {id === undefined && <option value="" disabled>{t('popup.mixed')}</option>}
          {id !== undefined && <option value="">{t('popup.actorNone')}</option>}
          {options.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {blocked?.slot === slot && <div style={blockedStyle}>{t(blocked.reason === 'parent' ? 'popup.actorParent' : 'popup.actorOverlap')}</div>}
      </>
    )
  }

  return (
    <>
      {field('p', 'popup.primaryActor', undefined, 'popup.existingPrimary', primary, primaryPatch, primaryOptions)}
      {allHavePrimary && Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ display: 'contents' }}>
          {field(i, 'popup.nestedActor', { n: i + 1 }, 'popup.existingNested', nestedAt(i), nestedPatch(i), nestedOptions(i))}
        </div>
      ))}
      {allHavePrimary && (
        <button onClick={() => setSlots(count + 1)} style={{ ...btnStyle('#888'), marginTop: 4 }}>
          + {t('popup.addNested')}
        </button>
      )}
    </>
  )
}

export default function PropertyPopover({ linkPaths = {} }) {
  const { selectedId, selectedType, nodes, links,
    updateNode, updateLink, deleteNode, deleteLink, reverseLink, deselect } = useStore()
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

    return frame(<>
        {header()}
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-title)', marginBottom: 4, fontFamily: 'monospace' }}>
          {t('popup.selected', { n: selectedIds.length })}
        </div>
        {!collapsed && <>
        <NodeActorFields key={selectedIds.join(',')} selected={selectedNodes} />
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

  const handleLabelChange = (e) => {
    updateNode(node.id, { label: e.target.value })
  }

  const handleTypeChange = (e) => {
    updateNode(node.id, { type: e.target.value })
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

      <NodeActorFields key={node.id} selected={[node]} />


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
