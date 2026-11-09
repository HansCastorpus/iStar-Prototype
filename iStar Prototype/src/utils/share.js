// Sharing a graph as a read-only link. The designer publishes a snapshot into a secret GitHub Gist (a file named
// graph.json) with their own access token; the link names that Gist and the viewer reads it back. Publishing again
// overwrites the same Gist, so the link stays the same and shows the new version.

const API = 'https://api.github.com/gists'
const FILE = 'graph.json'
const DESCRIPTION = 'i* Builder shared graph'

// ?view=<github user>/<gist id> → { user, id }, or null if the address isn't a share link
export function parseViewParam(search) {
  const m = /^([A-Za-z0-9-]+)\/([0-9a-f]+)$/i.exec(new URLSearchParams(search).get('view') ?? '')
  return m ? { user: m[1], id: m[2] } : null
}

export const shareLink = (user, id) => `${location.origin}${import.meta.env.BASE_URL}?view=${user}/${id}`

const failure = (res) => Object.assign(new Error(`GitHub answered ${res.status}`), { status: res.status })

// Saves `content` (the graph as JSON) into the Gist `gistId`, or into a new secret one if there is none (or it was deleted).
// → { user, id }
export async function publishGist({ token, gistId, content }) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
  const files = { [FILE]: { content } }
  let res = gistId && await fetch(`${API}/${gistId}`, { method: 'PATCH', headers, body: JSON.stringify({ description: DESCRIPTION, files }) })
  if (!res || res.status === 404) res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ description: DESCRIPTION, public: false, files }) })
  if (!res.ok) throw failure(res)
  const json = await res.json()
  return { user: json.owner.login, id: json.id }
}

// The graph's JSON text from a share link. The time in the address keeps a browser or CDN from serving an old copy.
export async function fetchShared({ user, id }) {
  const res = await fetch(`https://gist.githubusercontent.com/${user}/${id}/raw/${FILE}?t=${Date.now()}`)
  if (!res.ok) throw failure(res)
  return res.text()
}
