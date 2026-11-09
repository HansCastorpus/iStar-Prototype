import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useStore from '../store/useStore.js'
import { useT } from '../i18n.js'
import { isWebUrl, parseLinks, linksToText, readPicture } from '../utils/elementDetails.js'

// The editor's form for what the viewer's popup shows about an element: description, related actors, positive and negative
// aspects, links and pictures. Each change is saved as soon as it is made (text fields when you leave them).
const font = 'Roboto, sans-serif'
const label = { fontSize: 12, color: 'var(--text-3)', fontFamily: font, textTransform: 'uppercase', letterSpacing: 0.4 }
const hint = { fontSize: 11, color: 'var(--text-3)', fontFamily: font }
const field = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 13, fontFamily: font, resize: 'vertical',
  background: 'var(--node-fill)', color: 'var(--text-1)', border: '1px solid var(--border-md)',
}
const btn = { padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: font }
const approxKb = (s) => Math.round((s.length * 3) / 4 / 1024)

export default function DetailsEditor({ nodeId, onClose }) {
  const t = useT()
  const node = useStore(s => s.nodes[nodeId])
  const actors = useStore(s => s.actors)
  const actorList = useStore(s => s.actorList)
  const updateNode = useStore(s => s.updateNode)
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  // Typing the shown text is one undo step, like editing it on the graph; it ends when the field is left or the form closes
  const typingRef = useRef(false)
  const startTyping = () => { if (!typingRef.current) { typingRef.current = true; useStore.getState().beginBatch() } }
  const stopTyping = () => { if (typingRef.current) { typingRef.current = false; useStore.getState().endBatch() } }
  useEffect(() => stopTyping, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const names = useMemo(() => {
    const out = [...actorList]
    for (const a of Object.values(actors)) if (a.name && !out.includes(a.name)) out.push(a.name)
    for (const n of node?.details?.connected ?? []) if (!out.includes(n)) out.push(n)
    return out
  }, [actorList, actors, node])

  if (!node) return null
  const d = node.details ?? {}
  const save = (patch) => updateNode(nodeId, { details: { ...d, ...patch } })
  const images = d.images ?? []
  const stored = images.filter(src => !isWebUrl(src))
  const weight = stored.reduce((sum, src) => sum + approxKb(src), 0)

  const text = (key, rows) => (
    <textarea key={`${key}|${d[key] ?? ''}`} rows={rows} defaultValue={d[key] ?? ''} style={field}
      onBlur={e => { if (e.target.value !== (d[key] ?? '')) save({ [key]: e.target.value }) }} />
  )

  const addFiles = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    setBusy(true); setMessage('')
    const read = []
    for (const f of files) { const src = await readPicture(f); if (src) read.push(src) }
    setBusy(false)
    if (read.length < files.length) setMessage(t('details.unreadable'))
    if (read.length) save({ images: [...(useStore.getState().nodes[nodeId]?.details?.images ?? []), ...read] })
  }
  const addUrl = (e) => {
    e.preventDefault()
    if (!isWebUrl(url)) return setMessage(t('details.badUrl'))
    setMessage(''); setUrl('')
    save({ images: [...images, url.trim()] })
  }
  const move = (i, step) => {
    const next = [...images]
    const j = i + step
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    save({ images: next })
  }

  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0, 0, 0, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div role="dialog" aria-modal="true" aria-label={t('details.title')} style={{
        width: 460, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
        background: 'var(--bg-popup)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', fontFamily: font }}>{t('details.title')}</div>
            <div style={{ ...hint, fontSize: 13, color: 'var(--text-2)', overflowWrap: 'anywhere' }}>{node.label || t(`type.${node.type}`)}</div>
          </div>
          <button onClick={onClose} aria-label={t('details.close')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--text-2)' }}>×</button>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={label}>{t('details.shown')}</span>
          <textarea rows={2} value={node.label ?? ''} style={field} onFocus={startTyping} onBlur={stopTyping}
            onChange={e => updateNode(nodeId, { label: e.target.value.replace(/\s+/g, ' ') })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
          <span style={hint}>{t('details.shownHint')}</span>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={label}>{t('details.description')}</span>
          {text('description', 4)}
        </label>

        <div>
          <span style={label}>{t('details.related')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {names.length === 0 && <span style={hint}>{t('details.noActors')}</span>}
            {names.map(n => {
              const on = (d.connected ?? []).includes(n)
              return (
                <button type="button" key={n} className="tbtn" data-on={on} style={{ ...btn, padding: '2px 8px', fontSize: 12 }}
                  onClick={() => save({ connected: on ? d.connected.filter(c => c !== n) : [...(d.connected ?? []), n] })}>{n}</button>
              )
            })}
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={label}>{t('details.positive')}</span>
          {text('positive', 3)}
          <span style={hint}>{t('details.perLine')}</span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={label}>{t('details.negative')}</span>
          {text('negative', 3)}
          <span style={hint}>{t('details.perLine')}</span>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={label}>{t('details.links')}</span>
          <textarea key={linksToText(d.links)} rows={3} defaultValue={linksToText(d.links)} style={field} spellCheck={false}
            onBlur={e => {
              const { links, dropped } = parseLinks(e.target.value)
              setMessage(dropped ? t('details.badUrl') : '')
              if (linksToText(links) !== linksToText(d.links) || dropped) save({ links })
            }} />
          <span style={hint}>{t('details.linksHint')}</span>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={label}>{t('details.images')} ({images.length})</span>
          {images.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {images.map((src, i) => (
                <div key={`${i}|${src.slice(-24)}`} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 4 }}>
                  <img src={src} alt="" style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 3, flexShrink: 0, background: 'var(--node-fill)' }} />
                  <span style={{ ...hint, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isWebUrl(src) ? src : t('details.stored', { kb: approxKb(src) })}</span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('details.earlier')} className="tbtn" style={{ ...btn, padding: '2px 6px' }}>↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label={t('details.later')} className="tbtn" style={{ ...btn, padding: '2px 6px' }}>↓</button>
                  <button type="button" onClick={() => save({ images: images.filter((_, k) => k !== i) })} aria-label={t('details.remove')} className="tbtn" style={{ ...btn, padding: '2px 8px' }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="tbtn" style={{ ...btn, display: 'inline-block' }}>
              {busy ? t('details.reading') : t('details.addFiles')}
              <input type="file" accept="image/*" multiple disabled={busy} onChange={addFiles} style={{ display: 'none' }} />
            </label>
          </div>
          <form onSubmit={addUrl} style={{ display: 'flex', gap: 6 }}>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" spellCheck={false} aria-label={t('details.addUrl')} style={{ ...field, resize: 'none', flex: 1, minWidth: 0 }} />
            <button type="submit" className="tbtn" style={btn}>{t('details.addUrl')}</button>
          </form>
          {weight > 600 && <span style={{ ...hint, color: '#b45309' }}>{t('details.heavy', { kb: weight })}</span>}
        </div>

        {message && <div role="alert" style={{ fontSize: 12, color: '#dc2626', fontFamily: font }}>{message}</div>}
        <button onClick={onClose} className="tbtn" data-on style={{ ...btn, alignSelf: 'flex-start' }}>{t('details.close')}</button>
      </div>
    </div>,
    document.body,
  )
}
