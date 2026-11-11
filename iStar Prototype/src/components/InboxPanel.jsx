import { useMemo, useState } from 'react'
import useStore from '../store/useStore.js'
import { useT } from '../i18n.js'
import { DropHeader } from './FilterPanel.jsx'
import { typesFor, LINK_TYPES } from '../utils/language.js'
import { parseLinks, parseImages } from '../utils/elementDetails.js'

// Elements that came in from outside (the spreadsheet) and wait to be placed: listed by suggested actor, each with the
// information that came with it. Drag one onto the graph to place it. Placed ones stay in the list (shown, greyed or hidden).
const TYPES = ['goal', 'task', 'softgoal', 'resource']
export const INBOX_DRAG = 'application/x-istar-inbox'
const DEPENDUM_GROUP = '\u0000dependum'  // a key no actor name can have

const font = 'Roboto, sans-serif'
const card = { background: 'var(--bg-popup)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12,
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.12)' }
const smallLabel = { fontSize: 12, color: 'var(--text-3)', fontFamily: font, textTransform: 'uppercase', letterSpacing: 0.4 }
const field = {
  width: '100%', boxSizing: 'border-box', padding: '5px 8px', fontSize: 12, fontFamily: font,
  background: 'var(--node-fill)', color: 'var(--text-1)', border: '1px solid var(--border-md)',
}

export default function InboxPanel() {
  const t = useT()
  const open = useStore(s => s.inboxOpen)
  const setOpen = useStore(s => s.setInboxOpen)
  const inbox = useStore(s => s.inbox)
  const filter = useStore(s => s.inboxFilter)
  const setFilter = useStore(s => s.setInboxFilter)
  const actorList = useStore(s => s.actorList)
  const nodes = useStore(s => s.nodes)
  const models = useStore(s => s.models)
  const activeModelId = useStore(s => s.activeModelId)
  const actors = useStore(s => s.actors)
  const [adding, setAdding] = useState(false)
  const [titleOpen, setTitleOpen] = useState(true)
  const [closed, setClosed] = useState({})  // groups the designer has minimised, by actor name

  // An item counts as placed while its element still exists in some diagram (the open one is read live)
  const placedIds = useMemo(() => {
    const ids = new Set(Object.keys(nodes))
    for (const [id, m] of Object.entries(models)) if (id !== activeModelId) Object.keys(m.nodes).forEach(n => ids.add(n))
    return ids
  }, [nodes, models, activeModelId])
  const isPlaced = (item) => !!item.placedNodeId && placedIds.has(item.placedNodeId)

  // Every actor name we know of: the list, then those drawn on the graph, then any an item asks for
  const names = useMemo(() => {
    const out = [...actorList]
    for (const a of Object.values(actors)) if (a.name && !out.includes(a.name)) out.push(a.name)
    return out
  }, [actorList, actors])

  const groups = useMemo(() => {
    const visible = inbox.filter(i => filter !== 'hidden' || !isPlaced(i) || i.updated)
    // Dependums belong to no actor, so they get a group of their own, after the actors'
    const byActor = visible.filter(i => !i.dependum)
    const keys = [...names]
    for (const i of byActor) if (!keys.includes(i.actorName || '')) keys.push(i.actorName || '')
    const groups = keys.map(key => ({ key, items: byActor.filter(i => (i.actorName || '') === key) })).filter(g => g.items.length)
    const dependums = visible.filter(i => i.dependum)
    return dependums.length ? [...groups, { key: DEPENDUM_GROUP, dependum: true, items: dependums }] : groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox, names, filter, placedIds])

  if (!open) return null
  return (
    <div className="no-scrollbar" style={{
      position: 'absolute', top: 12, right: 0, bottom: 0, width: 340, maxWidth: '100%', zIndex: 120,
      overflowY: 'auto', padding: '0 12px 12px', pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ ...card, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <DropHeader open={titleOpen} onToggle={() => setTitleOpen(o => !o)}
          style={{ fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', fontFamily: font, color: 'var(--text-1)' }}
          extra={<button onClick={() => setOpen(false)} aria-label={t('inbox.close')} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, color: 'var(--text-2)', padding: '0 2px',
          }}>×</button>}>
          {t('inbox.title')}
        </DropHeader>

        {titleOpen && <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ ...smallLabel, marginRight: 4 }}>{t('inbox.placedShow')}</span>
          {['shown', 'greyed', 'hidden'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className="tbtn" data-on={filter === f}
              style={{ padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: font }}>
              {t(`inbox.${f}`)}
            </button>
          ))}
        </div>

        {adding
          ? <AddForm names={names} onDone={() => setAdding(false)} />
          : <button onClick={() => setAdding(true)} className="tbtn" style={{ alignSelf: 'flex-start', padding: '4px 8px', fontSize: 12, cursor: 'pointer', fontFamily: font }}>
              {t('inbox.add')}
            </button>}
        </>}
      </div>

      <ActorList names={names} />

      {groups.length === 0 && (
        <div style={{ ...card, pointerEvents: 'auto', fontSize: 12, color: 'var(--text-3)', fontFamily: font }}>{t('inbox.empty')}</div>
      )}
      {groups.map(g => (
        <div key={g.key} style={{ ...card, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <DropHeader open={!closed[g.key]} onToggle={() => setClosed(c => ({ ...c, [g.key]: !c[g.key] }))}
            style={{ fontSize: 12, fontWeight: 'bold', fontFamily: font, color: 'var(--text-1)' }}>
            {g.dependum ? t('inbox.dependums') : g.key || t('inbox.noActor')} <span style={{ fontWeight: 'normal', color: 'var(--text-3)' }}>({g.items.length})</span>
          </DropHeader>
          {!closed[g.key] && g.items.map(item => <Item key={item.id} item={item} placed={isPlaced(item)} dim={isPlaced(item) && filter === 'greyed' && !item.updated} />)}
        </div>
      ))}

    </div>
  )
}

// Names of the fields in a re-imported update, and how their new values read
const PENDING_LABELS = { text: 'inbox.text', type: 'inbox.type', actorName: 'inbox.actor', dependum: 'inbox.dependum', links: 'inbox.links', images: 'inbox.images' }
function showValue(key, v, t) {
  if (key === 'dependum') return t(v ? 'inbox.yes' : 'inbox.no')
  if (key === 'relationType') return v ? t(`type.${v}`) : '—'
  if (key === 'links') return (v ?? []).map(l => l.label ? `${l.label} | ${l.url}` : l.url).join('\n') || '—'
  if (Array.isArray(v)) return v.join('\n') || '—'
  return String(v ?? '') || '—'
}

function Item({ item, placed, dim }) {
  const t = useT()
  const remove = useStore(s => s.removeInboxItem)
  const applyUpdate = useStore(s => s.applyInboxUpdate)
  const dismissUpdate = useStore(s => s.dismissInboxUpdate)
  const [open, setOpen] = useState(false)
  const info = [['description', item.description], ['relationType', item.relationType && t(`type.${item.relationType}`)], ['relations', item.relations], ['positive', item.positive], ['negative', item.negative]].filter(([, v]) => v)
  const hasMore = info.length > 0 || item.connected?.length > 0
  return (
    <div
      draggable={!placed}
      onDragStart={e => { e.dataTransfer.setData(INBOX_DRAG, item.id); e.dataTransfer.effectAllowed = 'copy' }}
      title={placed ? t('inbox.placed') : t('inbox.drag')}
      style={{
        border: '1px solid var(--border-md)', borderLeft: `6px solid var(--hl-${item.type})`, borderRadius: 'var(--radius)',
        background: 'var(--node-fill)', padding: '6px 8px', cursor: placed ? 'default' : 'grab',
        opacity: dim ? 0.45 : 1, fontFamily: font, fontSize: 12, color: 'var(--text-1)',
      }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          <div style={smallLabel}>{item.num != null && `#${item.num} · `}{item.type}{item.dependum && ` · ${t('inbox.dependum')}`}{placed && ` · ${t('inbox.placed')}`}</div>
          {item.text || '—'}
        </div>
        {hasMore && (
          <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: '0 2px' }}>
            {open ? '▴' : '▾'}
          </button>
        )}
        {!placed && (
          <button onClick={() => remove(item.id)} aria-label={t('inbox.remove')} title={t('inbox.remove')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '0 2px' }}>×</button>
        )}
      </div>
      {item.updated && item.pending && (
        <div style={{ marginTop: 6, padding: '6px 8px', borderLeft: '4px solid #d97706', background: 'rgba(217, 119, 6, 0.1)', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <div><b style={{ color: '#b45309', textTransform: 'uppercase', letterSpacing: 0.4 }}>↻ {t('inbox.updated')}</b> <span style={{ color: 'var(--text-2)' }}>{t('inbox.updatedHint')}</span></div>
          {Object.entries(item.pending).map(([key, v]) => (
            <div key={key}><span style={smallLabel}>{t(PENDING_LABELS[key] ?? `inbox.${key}`)}</span><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{showValue(key, v, t)}</div></div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button onClick={() => applyUpdate(item.id)} title={t('inbox.updateHint')} className="tbtn" data-on style={{ padding: '3px 10px', fontSize: 12, cursor: 'pointer', fontFamily: font }}>{t('inbox.update')}</button>
            <button onClick={() => dismissUpdate(item.id)} className="tbtn" style={{ padding: '3px 10px', fontSize: 12, cursor: 'pointer', fontFamily: font }}>{t('inbox.ignore')}</button>
          </div>
        </div>
      )}
      {open && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          {info.map(([key, v]) => (
            <div key={key}><span style={smallLabel}>{t(`inbox.${key}`)}</span><div style={{ whiteSpace: 'pre-wrap' }}>{v}</div></div>
          ))}
          {item.connected?.length > 0 && (
            <div><span style={smallLabel}>{t('inbox.connected')}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                {item.connected.map(n => (
                  <span key={n} style={{ border: '1px solid var(--border-md)', borderRadius: 10, padding: '0 7px' }}>{n}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AddForm({ names, onDone }) {
  const t = useT()
  const addInboxItem = useStore(s => s.addInboxItem)
  const language = useStore(s => s.language)
  const empty = { type: 'goal', text: '', actorName: '', dependum: false, description: '', relationType: '', relations: '', positive: '', negative: '', linksText: '', imagesText: '', connected: [] }
  const [f, setF] = useState(empty)
  const set = (patch) => setF(prev => ({ ...prev, ...patch }))
  const submit = (e) => {
    e.preventDefault()
    if (!f.text.trim()) return
    const { linksText, imagesText, ...rest } = f
    addInboxItem({ ...rest, text: f.text.trim(), links: parseLinks(linksText).links, images: parseImages(imagesText).images })
    setF(empty)
  }
  const area = (key, labelKey = `inbox.${key}`) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={smallLabel}>{t(labelKey)}</span>
      <textarea rows={2} value={f[key]} onChange={e => set({ [key]: e.target.value })} style={{ ...field, resize: 'vertical' }} />
    </label>
  )
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span style={smallLabel}>{t('inbox.type')}</span>
          <select value={f.type} onChange={e => set({ type: e.target.value })} style={field}>
            {TYPES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 2 }}>
          <span style={smallLabel}>{t('inbox.actor')}</span>
          <select value={f.actorName} disabled={f.dependum} onChange={e => set({ actorName: e.target.value })} style={field}>
            <option value="">—</option>
            {names.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <label title={t('inbox.dependumHint')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: font, cursor: 'pointer' }}>
        <input type="checkbox" checked={f.dependum} onChange={e => set({ dependum: e.target.checked, ...(e.target.checked && { actorName: '' }) })} />
        {t('inbox.dependum')} <span style={{ color: 'var(--text-3)' }}>— {t('inbox.dependumHint')}</span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={smallLabel}>{t('inbox.text')}</span>
        <textarea rows={2} autoFocus value={f.text} onChange={e => set({ text: e.target.value })} style={{ ...field, resize: 'vertical' }} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={smallLabel}>{t('inbox.relationType')}</span>
        <select value={f.relationType} onChange={e => set({ relationType: e.target.value })} style={field}>
          <option value="">—</option>
          {typesFor(language, LINK_TYPES).map(x => <option key={x} value={x}>{t(`type.${x}`)}</option>)}
        </select>
      </label>
      {area('description')}
      {area('relations')}{area('positive')}{area('negative')}
      {area('linksText', 'inbox.links')}{area('imagesText', 'inbox.images')}
      <div>
        <span style={smallLabel}>{t('inbox.connected')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {names.map(n => {
            const on = f.connected.includes(n)
            return (
              <button type="button" key={n} onClick={() => set({ connected: on ? f.connected.filter(c => c !== n) : [...f.connected, n] })}
                className="tbtn" data-on={on} style={{ padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontFamily: font }}>{n}</button>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" className="tbtn" data-on style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: font }}>{t('inbox.save')}</button>
        <button type="button" onClick={onDone} className="tbtn" style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: font }}>{t('inbox.cancel')}</button>
      </div>
    </form>
  )
}

// The names contributors can pick from. Names of actors drawn on the graph are in it automatically.
function ActorList({ names }) {
  const t = useT()
  const actorList = useStore(s => s.actorList)
  const addActorName = useStore(s => s.addActorName)
  const removeActorName = useStore(s => s.removeActorName)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(true)
  const submit = (e) => { e.preventDefault(); addActorName(text); setText('') }
  return (
    <div style={{ ...card, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
      <DropHeader open={open} onToggle={() => setOpen(o => !o)}
        style={{ fontSize: 12, fontWeight: 'bold', fontFamily: font, color: 'var(--text-1)', textTransform: 'uppercase' }}>
        {t('inbox.actorList')}
      </DropHeader>
      {open && <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {names.map(n => (
          <span key={n} style={{ border: '1px solid var(--border-md)', borderRadius: 10, padding: '0 4px 0 8px', fontSize: 11, fontFamily: font, color: 'var(--text-1)' }}>
            {n}
            {actorList.includes(n)
              ? <button onClick={() => removeActorName(n)} aria-label={t('inbox.remove')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '0 3px' }}>×</button>
              : <span title={t('inbox.fromGraph')} style={{ color: 'var(--text-3)', padding: '0 4px' }}>·</span>}
          </span>
        ))}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 4 }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder={t('inbox.actorPlaceholder')} style={{ ...field, flex: 1, minWidth: 0 }} />
        <button type="submit" className="tbtn" style={{ padding: '4px 8px', fontSize: 12, cursor: 'pointer', fontFamily: font }}>{t('inbox.actorAdd')}</button>
      </form>
      </>}
    </div>
  )
}
