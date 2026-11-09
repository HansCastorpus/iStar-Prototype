// The extra information of an element, kept in node.details. The element on the graph is the recap; this is what the viewer's
// popup shows when the element is clicked:
//   description  text about the element
//   positive     positive aspects (one per line)
//   negative     negative aspects (one per line)
//   connected    names of the related actors
//   links        [{ label, url }] web links
//   images       [address or data URL] pictures, shown as a carousel
// It is filled in the Excel sheet, or in the editor. (details also holds `relations`, `relationType` and `suggestedActor`:
// notes for the designer that the viewer never shows.)

export const DETAIL_KEYS = ['description', 'positive', 'negative', 'connected', 'links', 'images']

// Only web addresses are accepted, so a link or picture can never run a script
export const isWebUrl = (s) => /^https?:\/\/\S+$/i.test(String(s ?? '').trim())
const isImageSrc = (s) => isWebUrl(s) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(String(s ?? ''))

// "Label | https://…" or just "https://…", one per line → { links, dropped: lines that were not a web address }
export function parseLinks(text) {
  const links = []
  let dropped = 0
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const bar = line.lastIndexOf('|')
    const url = (bar >= 0 ? line.slice(bar + 1) : line).trim()
    const label = bar >= 0 ? line.slice(0, bar).trim() : ''
    if (isWebUrl(url)) links.push({ label, url }); else dropped++
  }
  return { links, dropped }
}
export const linksToText = (links) => (links ?? []).map(l => (l.label ? `${l.label} | ${l.url}` : l.url)).join('\n')

// One address per line → { images, dropped }
export function parseImages(text) {
  const images = []
  let dropped = 0
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (isWebUrl(line)) images.push(line); else dropped++
  }
  return { images, dropped }
}
// Pictures that are stored inside the diagram (uploaded in the editor) can't be written in a cell: the sheet gets none of them
export const imagesToText = (images) => (images ?? []).filter(isWebUrl).join('\n')

// Whether the element has anything to show beyond its title
export function hasInfo(details) {
  if (!details) return false
  return !!(details.description?.trim() || details.positive?.trim() || details.negative?.trim()
    || details.connected?.length || details.links?.length || details.images?.length)
}

// What a share link carries of an element's details (the designer's own notes stay private)
export function publicDetails(details) {
  if (!details) return undefined
  const out = {}
  for (const k of DETAIL_KEYS) if (details[k]?.length) out[k] = details[k]
  return Object.keys(out).length ? out : undefined
}

// A picture chosen in the editor: scaled to fit 1000px and stored as a JPEG data URL (small enough to live in the diagram
// and in a share link). Resolves to null if the file isn't a readable image.
const PICTURE_MAX = 1000
export function readPicture(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, PICTURE_MAX / Math.max(img.width || PICTURE_MAX, img.height || PICTURE_MAX))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round((img.width || PICTURE_MAX) * k))
      c.height = Math.max(1, Math.round((img.height || PICTURE_MAX) * k))
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'  // JPEG has no transparency
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.78))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

export { isImageSrc }
