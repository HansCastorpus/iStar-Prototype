import { useMemo, useState } from 'react'
import useStore, { reachableModels, modelPath } from '../store/useStore.js'
import { useT } from '../i18n.js'

// The open model's own entry in `models` is stale, so give it its live nodes
function useLiveModels() {
  const models = useStore(s => s.models)
  const activeId = useStore(s => s.activeModelId)
  const nodes = useStore(s => s.nodes)
  return useMemo(() => ({ live: { ...models, [activeId]: { ...models[activeId], nodes } }, activeId }), [models, activeId, nodes])
}

// One tab per diagram (model) of the project, in a bar under the header. Sub-actor boxes open their
// diagram's tab; double-click a tab to rename it.
function Tabs() {
  const t = useT()
  const { live, activeId } = useLiveModels()
  const { switchModel, renameModel } = useStore()
  const [editing, setEditing] = useState(null)  // { id, text }
  const tabs = useMemo(() => reachableModels(live), [live])

  const commit = () => {
    if (editing) renameModel(editing.id, editing.text)
    setEditing(null)
  }

  return (
    <div role="tablist" style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', minWidth: 0, fontFamily: 'Roboto, sans-serif' }}>
      {tabs.map(({ id, name, depth }) => {
        const active = id === activeId
        const style = {
          display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
          fontSize: 13, fontFamily: 'Roboto, sans-serif', flexShrink: 0,
          background: 'transparent', color: 'var(--text-1)', border: 'none', boxShadow: 'none',
          fontWeight: active ? 700 : 400,  // the open diagram is bold; tabs have no hover or selection patch
        }
        if (editing?.id === id) {
          return (
            <input key={id} autoFocus value={editing.text}
              onChange={e => setEditing({ id, text: e.target.value })}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditing(null) }}
              style={{ ...style, border: '1px solid var(--border-md)', cursor: 'text', width: 150, background: 'var(--node-fill)', color: 'var(--text-1)', outline: 'none' }} />
          )
        }
        return (
          <button key={id} role="tab" aria-selected={active}
            title={t('tabs.rename')}
            onClick={() => switchModel(id)}
            onDoubleClick={() => setEditing({ id, text: name })}
            style={style}>
            <svg width="13" height="10" viewBox="0 0 13 10" aria-hidden style={{ flexShrink: 0, opacity: active ? 1 : 0.5 }}>
              <path d="M1.5 5 H11 M7 1.5 L11 5 L7 8.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {depth > 0 && <span aria-hidden style={{ opacity: 0.6 }}>↳</span>}
            <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          </button>
        )
      })}
    </div>
  )
}

// Path from the top diagram to the open one, on the right of the tab bar; only shown inside a sub-diagram
function Path() {
  const t = useT()
  const { live, activeId } = useLiveModels()
  const switchModel = useStore(s => s.switchModel)
  const path = useMemo(() => modelPath(live, activeId), [live, activeId])
  if (path.length < 2) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', fontFamily: 'Roboto, sans-serif', whiteSpace: 'nowrap', flexShrink: 0, padding: '0 8px' }}>
      <span style={{ color: 'var(--text-3)' }}>{t('tabs.path')}</span>
      {path.map((id, i) => (
        <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span aria-hidden style={{ color: 'var(--text-3)' }}>›</span>}
          {i === path.length - 1
            ? <strong style={{ color: 'var(--text-1)' }}>{live[id].name}</strong>
            : <button onClick={() => switchModel(id)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: '#0070f3' }}>
                {live[id].name}
              </button>}
        </span>
      ))}
    </div>
  )
}


export default function TabBar() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      background: 'var(--bg-header)', borderBottom: '1px solid var(--border)',
      padding: 0, flexShrink: 0,
    }}>
      {/* tabs start at the left of the bar and use the width available */}
      <div style={{ minWidth: 0, display: 'flex' }}>
        <Tabs />
      </div>
      <Path />
    </div>
  )
}
