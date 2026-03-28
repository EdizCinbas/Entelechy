import { useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Globe from 'react-globe.gl'
import type { GlobeMethods } from 'react-globe.gl'

interface GlobePoint {
  id: string
  label: string
  lat: number
  lng: number
}

interface Popup {
  point: GlobePoint
  x: number
  y: number
}

const POINTS: GlobePoint[] = [
  { id: 'california', label: 'California', lat: 36.7, lng: -119.4 },
  { id: 'kansas',     label: 'Kansas',     lat: 38.5, lng: -98.0  },
  { id: 'ukraine',    label: 'Ukraine',    lat: 49.0, lng: 32.0   },
  { id: 'india',      label: 'India',      lat: 20.0, lng: 78.9   },
  { id: 'australia',  label: 'Australia',  lat: -25.0, lng: 133.0 },
]

const ZOOM_DURATION = 800
const L_HORIZ = 24   // horizontal segment of L-line
const L_VERT  = 36   // vertical segment of L-line

export default function GlobePanel() {
  const globeRef     = useRef<GlobeMethods>(undefined!)
  const containerRef = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<Popup | null>(null)

  const handlePointClick = useCallback((point: object) => {
    const p = point as GlobePoint
    setPopup(null)
    globeRef.current.pointOfView({ lat: p.lat, lng: p.lng, altitude: 0.5 }, ZOOM_DURATION)

    setTimeout(() => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setPopup({
        point: p,
        x: rect.left + rect.width  / 2,
        y: rect.top  + rect.height / 2,
      })
    }, ZOOM_DURATION + 20)
  }, [])

  const dismiss = useCallback(() => setPopup(null), [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (e.buttons > 0) dismiss()
  }, [dismiss])

  return (
    <main ref={containerRef} className="panel--globe" onMouseMove={handleMouseMove}>
      <Globe
        ref={globeRef}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        pointsData={POINTS}
        pointLat="lat"
        pointLng="lng"
        pointLabel=""
        pointColor={() => '#4a9eff'}
        pointRadius={0.8}
        pointAltitude={0.01}
        onZoom={dismiss}
        onPointClick={handlePointClick}
        onGlobeClick={dismiss}
      />

      {popup && createPortal(
        <>
          {/* Card — bottom-left anchored to L-corner */}
          <div
            className="globe-popup__card"
            style={{
              position: 'fixed',
              left: popup.x + L_HORIZ,
              top:  popup.y - L_VERT,
              transform: 'translateY(-100%)',
            }}
          >
            <div className="globe-popup__title">{popup.point.label}</div>
            <div className="globe-popup__body">
              {/* extend with region data here */}
            </div>
          </div>

          {/* L-line SVG: vertical from dot up, then horizontal to card */}
          <svg
            style={{
              position: 'fixed',
              left: popup.x,
              top:  popup.y - L_VERT,
              width: L_HORIZ,
              height: L_VERT,
              overflow: 'visible',
              pointerEvents: 'none',
            }}
          >
            <line x1={0} y1={L_VERT} x2={0}       y2={0} stroke="#1e3a5f" strokeWidth="1" />
            <line x1={0} y1={0}      x2={L_HORIZ}  y2={0} stroke="#1e3a5f" strokeWidth="1" />
          </svg>

          {/* Dot at globe centre */}
          <div
            className="globe-popup__dot"
            style={{
              position: 'fixed',
              left: popup.x,
              top:  popup.y,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </>,
        document.body
      )}
    </main>
  )
}
