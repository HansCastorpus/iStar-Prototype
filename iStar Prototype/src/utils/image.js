// Logos are stored inside the diagram, so keep them small: scaled to fit 256px, as a PNG data URL
// with its aspect ratio (width / height). Resolves to null if the file isn't a readable image.
const LOGO_MAX = 256

export function shrinkImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      // Vector images have no fixed pixel size, so they are rendered at full size; bitmaps are only shrunk
      const fit = LOGO_MAX / Math.max(img.width || LOGO_MAX, img.height || LOGO_MAX)
      const k = file.type === 'image/svg+xml' ? fit : Math.min(1, fit)
      const c = document.createElement('canvas')
      const w = img.width || LOGO_MAX, h = img.height || LOGO_MAX
      c.width = Math.max(1, Math.round(w * k))
      c.height = Math.max(1, Math.round(h * k))
      const ctx = c.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve({ url: c.toDataURL('image/png'), aspect: c.width / c.height })
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}
