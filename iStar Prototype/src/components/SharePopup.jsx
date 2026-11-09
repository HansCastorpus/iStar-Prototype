import { useEffect, useState } from 'react'
import useStore from '../store/useStore.js'
import { useT } from '../i18n.js'
import { shareLink } from '../utils/share.js'
import { hasVault, legacyToken, saveVault, openVault, clearVault } from '../utils/vault.js'

// Publishing a read-only link, behind a password. The GitHub token it needs is kept encrypted with that password (see
// utils/vault.js), so the popup has three steps: set up (token + a new password), unlock (password), then the sharing itself.
const MIN_PASSWORD = 6
const font = 'Roboto, sans-serif'
const label = { fontSize: 12, color: 'var(--text-3)', fontFamily: font, textTransform: 'uppercase', letterSpacing: 0.4 }
const field = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 13, fontFamily: font,
  background: 'var(--node-fill)', color: 'var(--text-1)', border: '1px solid var(--border-md)',
}
const btn = { padding: '5px 12px', fontSize: 13, cursor: 'pointer', fontFamily: font }
const note = { fontSize: 11, color: 'var(--text-2)', fontFamily: font, lineHeight: 1.5 }

export default function SharePopup({ onClose }) {
  const t = useT()
  const share = useStore(s => s.share)
  const publishShare = useStore(s => s.publishShare)
  const [step, setStep] = useState(hasVault() ? 'locked' : 'setup')  // 'setup' | 'locked' | 'open'
  const [token, setToken] = useState(legacyToken())  // the GitHub token: typed in at set-up, then kept here while unlocked
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState(share ? shareLink(share.user, share.gistId) : '')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fail = (key) => { setError(t(key)); setBusy(false) }

  const setUp = async (e) => {
    e.preventDefault()
    if (!token.trim()) return fail('share.needToken')
    if (password.length < MIN_PASSWORD) return fail('share.short')
    if (password !== again) return fail('share.mismatch')
    setBusy(true)
    try { await saveVault(token.trim(), password) } catch { return fail('share.storeFailed') }
    setToken(token.trim()); setPassword(''); setAgain(''); setError(''); setBusy(false); setStep('open')
  }

  const unlock = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      setToken(await openVault(password))
      setPassword(''); setError(''); setBusy(false); setStep('open')
    } catch { fail('share.wrong') }
  }

  const publish = async () => {
    setBusy(true); setError(''); setCopied(false)
    try {
      const url = await publishShare(token)
      setLink(url)
      try { await navigator.clipboard.writeText(url); setCopied(true) } catch { /* the link is shown below anyway */ }
      setBusy(false)
    } catch (e) {
      if (e.status === 401 || e.status === 403) fail('share.badToken')
      else { setError(t('share.failed', { why: e.message })); setBusy(false) }
    }
  }

  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true) } catch { /* nothing to do */ } }

  const reset = () => {
    if (!confirm(t('share.forgotConfirm'))) return
    clearVault()
    setToken(''); setPassword(''); setAgain(''); setError(''); setStep('setup')
  }

  const row = { display: 'flex', flexDirection: 'column', gap: 3 }
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0, 0, 0, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div role="dialog" aria-modal="true" aria-label={t('share.title')} style={{
        width: 400, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
        background: 'var(--bg-popup)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', fontFamily: font }}>{t('share.title')}</div>
          <button onClick={onClose} aria-label={t('share.close')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--text-2)' }}>×</button>
        </div>

        {step === 'setup' && (
          <form onSubmit={setUp} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={note}>{t('share.setupIntro')}</div>
            <label style={row}><span style={label}>{t('share.token')}</span>
              <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} style={field} autoFocus /></label>
            <label style={row}><span style={label}>{t('share.passwordNew')}</span>
              <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} style={field} /></label>
            <label style={row}><span style={label}>{t('share.passwordAgain')}</span>
              <input type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} style={field} /></label>
            <button type="submit" disabled={busy} className="tbtn" data-on style={{ ...btn, alignSelf: 'flex-start' }}>{t('share.protect')}</button>
          </form>
        )}

        {step === 'locked' && (
          <form onSubmit={unlock} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={note}>{t('share.lockedIntro')}</div>
            <label style={row}><span style={label}>{t('share.password')}</span>
              <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} style={field} autoFocus /></label>
            <button type="submit" disabled={busy || !password} className="tbtn" data-on style={{ ...btn, alignSelf: 'flex-start' }}>{t('share.unlock')}</button>
            <button type="button" onClick={reset} style={{ ...note, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, textDecoration: 'underline' }}>{t('share.forgot')}</button>
          </form>
        )}

        {step === 'open' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={note}>{t(share ? 'share.openShared' : 'share.openNew')}</div>
            <button onClick={publish} disabled={busy} className="tbtn" data-on style={{ ...btn, alignSelf: 'flex-start' }}>
              {busy ? t('share.publishing') : t(share ? 'share.update' : 'share.publish')}
            </button>
            {link && (
              <div style={row}>
                <span style={label}>{t('share.link')}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input readOnly value={link} onFocus={e => e.target.select()} style={{ ...field, flex: 1, minWidth: 0 }} />
                  <button onClick={copy} className="tbtn" style={btn}>{t(copied ? 'share.copied' : 'share.copy')}</button>
                </div>
              </div>
            )}
            <div style={note}>{t('share.note')}</div>
            <button onClick={reset} style={{ ...note, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, textDecoration: 'underline' }}>{t('share.remove')}</button>
          </div>
        )}

        {error && <div role="alert" style={{ fontSize: 12, color: '#dc2626', fontFamily: font }}>{error}</div>}
      </div>
    </div>
  )
}
