import { useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Globe from 'react-globe.gl'
import type { GlobeMethods } from 'react-globe.gl'
import * as THREE from 'three'
import CROP_IMAGES from '../data/cropImages'

interface GlobePoint {
  id: string
  label: string
  lat: number
  lng: number
}

interface WeatherData {
  temperature: number | null
  feels_like: number | null
  humidity: number | null
  wind_speed: number | null
  cloud_cover: number | null
}

interface FloodDay {
  date: string
  discharge: number
}

interface Popup {
  point: GlobePoint
  x: number
  y: number
}

// Centers computed from field centroids in almond_fields_2024.csv / wheat_fields_2024.csv
const POINTS: GlobePoint[] = [
  { id: 'california',  label: 'California Almonds', lat: 36.5,  lng: -119.9 },
  { id: 'kansas',      label: 'Kansas Wheat',       lat: 37.7,  lng: -98.3  },
  { id: 'northdakota', label: 'North Dakota Wheat', lat: 48.8,  lng: -99.9  },
]

const CLOUD_URL     = '/earth-clouds.jpg'
const ZOOM_DURATION = 800
const L_HORIZ = 24
const L_VERT  = 36

function fetchWeather(lat: number, lng: number): Promise<WeatherData> {
  return fetch(
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,cloud_cover` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph`
  )
    .then(r => r.json())
    .then(data => {
      const c = data?.current
      return {
        temperature: c?.temperature_2m      ?? null,
        feels_like:  c?.apparent_temperature ?? null,
        humidity:    c?.relative_humidity_2m ?? null,
        wind_speed:  c?.wind_speed_10m       ?? null,
        cloud_cover: c?.cloud_cover          ?? null,
      }
    })
}

function fetchFlood(lat: number, lng: number): Promise<FloodDay[]> {
  return fetch(
    `https://flood-api.open-meteo.com/v1/flood` +
    `?latitude=${lat}&longitude=${lng}` +
    `&daily=river_discharge&forecast_days=5`
  )
    .then(r => r.json())
    .then(data => {
      const dates     = data?.daily?.time            ?? []
      const discharge = data?.daily?.river_discharge ?? []
      return dates.map((d: string, i: number) => ({ date: d, discharge: discharge[i] ?? 0 }))
    })
}

function FloodSparkline({ days }: { days: FloodDay[] }) {
  const W = 200, H = 48, PL = 36, PB = 16, PT = 6, PR = 6
  const iW = W - PL - PR
  const iH = H - PT - PB
  const vals   = days.map(d => d.discharge)
  const maxVal = Math.max(...vals, 1)
  const minVal = Math.min(...vals, 0)
  const range  = maxVal - minVal || 1
  const xS = (i: number) => PL + (i / (days.length - 1)) * iW
  const yS = (v: number) => PT + iH - ((v - minVal) / range) * iH
  const points = days.map((d, i) => `${xS(i)},${yS(d.discharge)}`).join(' ')

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4a5568', marginBottom: 4 }}>
        River Discharge (5d) · m³/s
      </div>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        {/* y labels */}
        {[minVal, maxVal].map((v, i) => (
          <text key={i} x={PL - 4} y={yS(v) + 3} textAnchor="end" fontSize={8} fill="#4a5568">
            {v.toFixed(0)}
          </text>
        ))}
        {/* area */}
        <polygon
          points={`${xS(0)},${PT + iH} ${points} ${xS(days.length - 1)},${PT + iH}`}
          fill="rgba(74,158,255,0.1)"
        />
        {/* line */}
        <polyline points={points} fill="none" stroke="#4a9eff" strokeWidth="1.5" strokeLinejoin="round" />
        {/* dots + date labels */}
        {days.map((d, i) => (
          <g key={i}>
            <circle cx={xS(i)} cy={yS(d.discharge)} r={2.5} fill="#4a9eff" />
            <text x={xS(i)} y={H - 2} textAnchor="middle" fontSize={8} fill="#4a5568">
              {d.date.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export default function GlobePanel() {
  const globeRef     = useRef<GlobeMethods>(undefined!)
  const containerRef = useRef<HTMLDivElement>(null)
  const cloudMeshRef = useRef<THREE.Mesh | null>(null)

  const [popup,       setPopup]      = useState<Popup | null>(null)
  const [cloudsOn,    setCloudsOn]   = useState(false)
  const [globeReady,  setGlobeReady] = useState(false)
  const [weather,     setWeather]    = useState<WeatherData | null>(null)
  const [wxLoading,   setWxLoading]  = useState(false)
  const [flood,        setFlood]       = useState<FloodDay[] | null>(null)
  const [floodLoading, setFloodLoading] = useState(false)
  // Cloud layer
  useEffect(() => {
    const globe = globeRef.current
    if (!globe?.scene) return
    const scene = globe.scene()
    if (cloudsOn) {
      new THREE.TextureLoader().load(CLOUD_URL, (texture) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(101, 64, 64),
          new THREE.MeshLambertMaterial({ map: texture, transparent: true, opacity: 0.15, depthWrite: false })
        )
        cloudMeshRef.current = mesh
        scene.add(mesh)
      }, undefined, (err) => console.error('[Globe] cloud texture failed', err))
    } else {
      if (cloudMeshRef.current) {
        scene.remove(cloudMeshRef.current)
        cloudMeshRef.current.geometry.dispose()
        ;(cloudMeshRef.current.material as THREE.Material).dispose()
        cloudMeshRef.current = null
      }
    }
  }, [cloudsOn, globeReady])

  const openPopup = useCallback((point: GlobePoint) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setPopup({ point, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })

    setWeather(null)
    setFlood(null)
    setWxLoading(true)
    setFloodLoading(true)

    fetchWeather(point.lat, point.lng)
      .then(setWeather)
      .catch(() => setWeather({ temperature: null, feels_like: null, humidity: null, wind_speed: null, cloud_cover: null }))
      .finally(() => setWxLoading(false))

    fetchFlood(point.lat, point.lng)
      .then(setFlood)
      .catch(() => setFlood([]))
      .finally(() => setFloodLoading(false))
  }, [])

  const handlePointClick = useCallback((point: object) => {
    const p = point as GlobePoint
    setPopup(null)
    globeRef.current.pointOfView({ lat: p.lat, lng: p.lng, altitude: 0.5 }, ZOOM_DURATION)
    setTimeout(() => openPopup(p), ZOOM_DURATION + 20)
  }, [openPopup])

  const dismiss = useCallback(() => setPopup(null), [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (e.buttons > 0) dismiss()
  }, [dismiss])

  const crops = popup ? (CROP_IMAGES[popup.point.id] ?? []) : []

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
        onGlobeReady={() => setGlobeReady(true)}
      />

      {popup && createPortal(
        <>
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

              {/* Crop images */}
              {crops.length > 0 && (
                <div className="globe-popup__crops">
                  {crops.map(({ crop, src }) => (
                    <div key={crop} className="globe-popup__crop-item">
                      <img src={src} alt={crop} className="globe-popup__crop-img" />
                      <span className="globe-popup__crop-label">{crop}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Weather */}
              {wxLoading && <div className="globe-popup__wx-row globe-popup__wx-loading">Loading…</div>}
              {weather && !wxLoading && (
                <div className="globe-popup__wx">
                  {weather.temperature !== null && (
                    <div className="globe-popup__wx-row">
                      <span>Temp</span><span>{weather.temperature.toFixed(1)}°F</span>
                    </div>
                  )}
                  {weather.humidity !== null && (
                    <div className="globe-popup__wx-row">
                      <span>Humidity</span><span>{weather.humidity}%</span>
                    </div>
                  )}
                  {weather.wind_speed !== null && (
                    <div className="globe-popup__wx-row">
                      <span>Wind</span><span>{weather.wind_speed.toFixed(1)} mph</span>
                    </div>
                  )}
                  {weather.cloud_cover !== null && (
                    <div className="globe-popup__wx-row">
                      <span>Clouds</span><span>{weather.cloud_cover}%</span>
                    </div>
                  )}
                </div>
              )}

              {/* Flood sparkline */}
              {floodLoading && <div className="globe-popup__wx-row globe-popup__wx-loading">Loading river data…</div>}
              {flood && flood.length > 0 && !floodLoading && <FloodSparkline days={flood} />}

            </div>
          </div>

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
            <line x1={0} y1={L_VERT} x2={0}      y2={0} stroke="#1e3a5f" strokeWidth="1" />
            <line x1={0} y1={0}      x2={L_HORIZ} y2={0} stroke="#1e3a5f" strokeWidth="1" />
          </svg>

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

      <button
        className="globe-clouds-btn"
        onClick={() => setCloudsOn(v => !v)}
        title="Toggle cloud layer"
      >
        {cloudsOn ? '☁ Clouds ON' : '☁ Clouds OFF'}
      </button>
    </main>
  )
}
