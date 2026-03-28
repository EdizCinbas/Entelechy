import { useRef, useState, useCallback, useEffect } from 'react'
import Globe from 'react-globe.gl'
import type { GlobeMethods } from 'react-globe.gl'
import * as THREE from 'three'

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

const POINTS: GlobePoint[] = [
  { id: 'california', label: 'California', lat: 36.7,  lng: -119.4 },
  { id: 'kansas',     label: 'Kansas',     lat: 38.5,  lng: -98.0  },
  { id: 'ukraine',    label: 'Ukraine',    lat: 49.0,  lng: 32.0   },
  { id: 'india',      label: 'India',      lat: 20.0,  lng: 78.9   },
  { id: 'australia',  label: 'Australia',  lat: -25.0, lng: 133.0  },
]

const CLOUD_URL = '/earth-clouds.jpg'

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

export default function GlobePanel() {
  const globeRef     = useRef<GlobeMethods>(undefined!)
  const cloudMeshRef = useRef<THREE.Mesh | null>(null)

  const [selected, setSelected]   = useState<GlobePoint | null>(null)
  const [cloudsOn, setCloudsOn]   = useState(false)
  const [globeReady, setGlobeReady] = useState(false)
  const [weather, setWeather]     = useState<WeatherData | null>(null)
  const [wxLoading, setWxLoading] = useState(false)

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

  const handleGlobeClick = useCallback(({ lat, lng }: { lat: number, lng: number }) => {
    setSelected({ id: 'click', label: `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`, lat, lng })
    setWeather(null)
    setWxLoading(true)
    fetchWeather(lat, lng)
      .then(setWeather)
      .catch(() => setWeather({ temperature: null, feels_like: null, humidity: null, wind_speed: null, cloud_cover: null }))
      .finally(() => setWxLoading(false))
  }, [])

  return (
    <>
      {/* cloud toggle */}
      <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 200 }}>
        <button
          onClick={() => setCloudsOn(v => !v)}
          style={{
            background: cloudsOn ? '#1a2540' : 'rgba(10,12,16,0.8)',
            border: `1px solid ${cloudsOn ? '#4a9eff' : '#1e2330'}`,
            color: cloudsOn ? '#4a9eff' : '#4a5568',
            borderRadius: 3, padding: '4px 10px', fontSize: 10,
            cursor: 'pointer', letterSpacing: '0.08em', backdropFilter: 'blur(4px)',
          }}
        >
          ☁ Clouds
        </button>
      </div>

      {/* weather card */}
      {selected && (
        <div style={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          background: 'rgba(10,14,20,0.92)',
          border: '1px solid #1e3a5f',
          borderRadius: 6,
          padding: '12px 18px',
          minWidth: 220,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 0 24px rgba(74,158,255,0.08), 0 4px 16px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4a9eff' }}>
              {selected.label}
            </span>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>
          {wxLoading && <div style={{ fontSize: 11, color: '#4a5568' }}>Loading weather…</div>}
          {!wxLoading && weather && (
            <div style={{ fontSize: 11, lineHeight: 2, color: '#8a9ab8' }}>
              {weather.temperature !== null && (
                <div>Temp <span style={{ color: '#c8d0e0' }}>{weather.temperature}°F</span>
                  {weather.feels_like !== null && <span style={{ color: '#4a5568' }}> / feels {weather.feels_like}°F</span>}
                </div>
              )}
              {weather.humidity    !== null && <div>Humidity   <span style={{ color: '#c8d0e0' }}>{weather.humidity}%</span></div>}
              {weather.wind_speed  !== null && <div>Wind       <span style={{ color: '#c8d0e0' }}>{weather.wind_speed} mph</span></div>}
              {weather.cloud_cover !== null && <div>Cloud cover <span style={{ color: '#c8d0e0' }}>{weather.cloud_cover}%</span></div>}
            </div>
          )}
        </div>
      )}

      {/* globe */}
      <main className="panel--globe">
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
          onGlobeReady={() => setGlobeReady(true)}
          onGlobeClick={handleGlobeClick}
        />
      </main>
    </>
  )
}
