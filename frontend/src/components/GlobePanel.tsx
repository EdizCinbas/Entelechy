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

const CLOUD_URL    = '/earth-clouds.jpg'
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
        temperature:  c?.temperature_2m       ?? null,
        feels_like:   c?.apparent_temperature ?? null,
        humidity:     c?.relative_humidity_2m ?? null,
        wind_speed:   c?.wind_speed_10m       ?? null,
        cloud_cover:  c?.cloud_cover          ?? null,
      }
    })
}

export default function GlobePanel() {
  const globeRef     = useRef<GlobeMethods>(undefined!)
  const containerRef = useRef<HTMLDivElement>(null)
  const cloudMeshRef = useRef<THREE.Mesh | null>(null)

  const [popup,      setPopup]      = useState<Popup | null>(null)
  const [cloudsOn,   setCloudsOn]   = useState(false)
  const [globeReady, setGlobeReady] = useState(false)
  const [weather,    setWeather]    = useState<WeatherData | null>(null)
  const [wxLoading,  setWxLoading]  = useState(false)

  // Cloud layer
  useEffect(() => {
    const globe = globeRef.current
    if (!globe?.scene) return
    const scene = globe.scene()
    if (cloudsOn) {
      new THREE.TextureLoader().load(CLOUD_URL, (texture) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(101, 64, 64),
          new THREE.MeshLambertMaterial({ map: texture, transparent: true, opacity: 0.7, depthWrite: false })
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
    setWxLoading(true)
    fetchWeather(point.lat, point.lng)
      .then(setWeather)
      .catch(() => setWeather({ temperature: null, feels_like: null, humidity: null, wind_speed: null, cloud_cover: null }))
      .finally(() => setWxLoading(false))
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
          {/* Card */}
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

              {/* Satellite crop images (predefined points only) */}
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

              {/* Live weather */}
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

            </div>
          </div>

          {/* L-line connector */}
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

          {/* Dot */}
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

      {/* Cloud toggle */}
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
