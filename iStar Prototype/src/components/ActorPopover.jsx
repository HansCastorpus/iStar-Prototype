import { useState } from 'react'
import useStore from '../store/useStore.js'
import { useZoom, worldToScreen } from '../contexts/ZoomContext.jsx'
import { usePopupPlacement, diagramObstacles } from '../utils/usePopupPlacement.js'
import { useT } from '../i18n.js'
import { inActor } from '../utils/actorTree.js'
import { shrinkImage } from '../utils/image.js'
import PopupConnector from './PopupConnector.jsx'
import PopoverHeader from './PopoverHeader.jsx'
import { HEADER_H, popoverStyle, labelStyle, inputStyle, summaryStyle, btnStyle, confirmOnEnter } from './popupStyles.js'

// Edit popup for an actor, anchored to its name tag. Opened by clicking the name tag (see Actor.jsx);
// placed by the same rules as the other popups, and steps around them.
export default function ActorPopover({ linkPaths = {} }) {
  const { transform } = useZoom()
  const actorId  = useStore(s => s.editingActorId)
  const actor    = useStore(s => s.actors[s.editingActorId])
  const tagRect  = useStore(s => s.editingActorTag)
  const nodes    = useStore(s => s.nodes)
  const closeActorEditor = useStore(s => s.closeActorEditor)
  const [collapsed, setCollapsed] = useState(false)

  let anchor = null
  if (actor && tagRect) {
    const a = worldToScreen(tagRect.x, tagRect.y, transform)
    const b = worldToScreen(tagRect.x + tagRect.w, tagRect.y + tagRect.h, transform)
    anchor = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }
  }

  const { pos, popRef, handleRef, dragProps, connector } = usePopupPlacement({
    id: 'actor',
    avoid: ['properties', 'link-type'],  // placed after those, so it steps around them
    anchor,
    getObstacles: () => diagramObstacles({ nodes, linkPaths, transform }),
    resetKey: actorId ?? '',
  })

  if (!actor || !anchor) return null

  return (
    <>
      <PopupConnector connector={connector} pos={pos} />
      <div ref={popRef} style={{ ...popoverStyle(pos.x, pos.y), paddingTop: HEADER_H + 4 }}>
        <PopoverHeader
          handleRef={handleRef}
          dragProps={dragProps}
          collapsed={collapsed}
          onToggle={() => setCollapsed(c => !c)}
          onClose={closeActorEditor}
        />
        {collapsed
          ? <div style={summaryStyle}>{actor.name}</div>
          : <ActorFields key={actor.id} actor={actor} />}
      </div>
    </>
  )
}

// Keyed by actor, so the typed name and the ungroup confirmation reset when another actor is opened
function ActorFields({ actor }) {
  const t = useT()
  const actors = useStore(s => s.actors)
  const memberCount = useStore(s => Object.values(s.nodes).filter(n => inActor(n, actor.id)).length)
  const { renameActor, ungroupActor, setActorLevel, setActorLogo } = useStore()
  const [typed, setTyped] = useState(actor.name)
  const [confirmUngroup, setConfirmUngroup] = useState(false)

  // Typing another actor's name will merge into it; say so before it happens
  const mergeTarget = Object.values(actors).find(a => a.id !== actor.id && a.name === typed.trim())

  return (
    <>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-title)', fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>
        {t('actorPopup.title')} · {t(memberCount === 1 ? 'actorPopup.element' : 'actorPopup.elements', { n: memberCount })}
      </div>

      <label style={labelStyle}>{t('actorPopup.name')}</label>
      <input
        autoFocus
        value={typed}
        onChange={e => setTyped(e.target.value)}
        onBlur={() => renameActor(actor.id, typed)}
        onKeyDown={confirmOnEnter}
        style={inputStyle}
        placeholder={t('popup.actorPlaceholder')}
      />
      {mergeTarget && (
        <div style={{ fontSize: 11, color: 'var(--text-1)', fontFamily: 'Roboto Mono, monospace', lineHeight: 1.4 }}>
          {t('actorPopup.mergeHint', { name: mergeTarget.name })}
        </div>
      )}

      <label style={labelStyle}>{t('actorPopup.level')}</label>
      <input
        type="number"
        min={1}
        step={1}
        value={actor.level ?? 1}
        onChange={e => setActorLevel(actor.id, e.target.value)}
        onKeyDown={confirmOnEnter}
        style={inputStyle}
        title={t('actorPopup.levelHint')}
      />

      <label style={labelStyle}>{t('actorPopup.logo')}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {actor.logo && <img src={actor.logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />}
        <label style={{ ...btnStyle('#888'), cursor: 'pointer' }}>
          {t(actor.logo ? 'actorPopup.logoChange' : 'actorPopup.logoAdd')}
          <input
            type="file" accept="image/*" style={{ display: 'none' }}
            onChange={async e => {
              const file = e.target.files[0]
              e.target.value = ''
              const img = file && await shrinkImage(file)
              if (img) setActorLogo(actor.id, img.url, img.aspect)
            }}
          />
        </label>
        {actor.logo && <button onClick={() => setActorLogo(actor.id, null)} style={btnStyle('#888')}>{t('actorPopup.logoRemove')}</button>}
      </div>

      <div style={{ marginTop: 6 }}>
        {confirmUngroup ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => ungroupActor(actor.id)} style={btnStyle('#c00')}>{t('actorPopup.confirmUngroup')}</button>
            <button onClick={() => setConfirmUngroup(false)} style={btnStyle('#888')}>{t('popup.cancel')}</button>
          </div>
        ) : (
          <button onClick={() => setConfirmUngroup(true)} style={btnStyle('#c00')} title={t('actorPopup.ungroupHint')}>
            {t('actorPopup.ungroup')}
          </button>
        )}
      </div>
    </>
  )
}
