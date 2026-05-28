import { createContext, useContext } from 'react'

// Provides both the reactive transform (for positioned HTML overlays)
// and a ref (for drag handlers that need the live value without re-renders).
export const ZoomContext = createContext({
  transform: { x: 0, y: 0, k: 1 },
  transformRef: { current: { x: 0, y: 0, k: 1 } },
})

export const useZoom = () => useContext(ZoomContext)

// Converts a world-space point to screen-space (for HTML overlay positioning).
export function worldToScreen(wx, wy, transform) {
  return {
    x: wx * transform.k + transform.x,
    y: wy * transform.k + transform.y,
  }
}
