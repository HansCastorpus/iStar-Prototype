import { useState } from 'react'
import useStore from '../store/useStore.js'
import { useT } from '../i18n.js'

// Title of the open diagram, in the top left of the work area. It is the same name as the diagram's tab
// (and its sub-actor box); double-click to rename it.
export default function WorkTitle() {
  const t = useT()
  const id = useStore(s => s.activeModelId)
  const name = useStore(s => s.models[s.activeModelId]?.name ?? '')
  const renameModel = useStore(s => s.renameModel)
  const [text, setText] = useState(null)  // set while renaming

  const commit = () => {
    if (text != null) renameModel(id, text)
    setText(null)
  }

  const style = {
    position: 'absolute', top: 12, left: 16, zIndex: 5, maxWidth: '60%',
    font: '700 22px Roboto Mono, monospace', color: 'var(--text-title)', margin: 0,
  }

  if (text != null) {
    return (
      <input autoFocus value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setText(null) }}
        style={{ ...style, width: 320, padding: '0 4px', border: '1px solid var(--border-md)', background: 'var(--node-fill)', outline: 'none' }} />
    )
  }
  return (
    <h1 title={t('tabs.rename')} onDoubleClick={() => setText(name)}
      style={{ ...style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', userSelect: 'none' }}>
      {name}
    </h1>
  )
}
