// The GitHub token used to publish a share link is kept in this browser encrypted with a password the designer chooses
// (AES-GCM, key from the password with PBKDF2). Without the password the stored text is useless, so nobody else who
// opens the editor on this computer can publish or update the shared graph. The password itself is never stored.

const KEY = 'istar-gist-vault'
const LEGACY = 'istar-gist-token'  // earlier versions kept the token as plain text
const ITERATIONS = 250000

const enc = new TextEncoder()
const dec = new TextDecoder()
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function keyFrom(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

const read = (key) => { try { return localStorage.getItem(key) } catch { return null } }

export const hasVault = () => !!read(KEY)
// A token saved as plain text by an earlier version: offered for protection the first time
export const legacyToken = () => read(LEGACY) ?? ''

// Encrypts `token` with `password` and keeps it, replacing whatever was there (also the plain-text one)
export async function saveVault(token, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(password, salt), enc.encode(token))
  localStorage.setItem(KEY, JSON.stringify({ salt: toB64(salt), iv: toB64(iv), data: toB64(data) }))
  localStorage.removeItem(LEGACY)
}

// → the token, or throws an Error('wrong-password') (AES-GCM fails to decrypt with a wrong password)
export async function openVault(password) {
  try {
    const { salt, iv, data } = JSON.parse(read(KEY))
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await keyFrom(password, fromB64(salt)), fromB64(data))
    return dec.decode(plain)
  } catch {
    throw new Error('wrong-password')
  }
}

// Forgets the token and the password check (the way back in if the password is lost)
export function clearVault() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY) } catch { /* storage unavailable */ }
}
