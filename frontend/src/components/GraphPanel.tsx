import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'

interface SentimentResult {
  crop: string
  sentiment: 'positive' | 'neutral' | 'negative'
  score: number
  articles_analysed: number
}

const SENTIMENT_COLOUR = {
  positive: '#2ecc71',
  neutral:  '#74B9FF',
  negative: '#e74c3c',
}

// ── Shared regions ───────────────────────────────────────

interface Region {
  id: string
  label: string
  lat: number
  lng: number
}

const REGIONS: Region[] = [
  { id: 'california',  label: 'California',  lat: 36.5, lng: -119.9 },
  { id: 'kansas',      label: 'Kansas',      lat: 37.7, lng: -98.3  },
  { id: 'northdakota', label: 'N. Dakota',   lat: 48.8, lng: -99.9  },
]

// ── Collapsible section wrapper ──────────────────────────

function Section({ title, accent = '#4a9eff', action, children }: { title: string; accent?: string; action?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="chart-section">
      <div className="chart-section__header" style={{ borderLeftColor: accent }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span className="chart-section__title">{title}</span>
          <span className="chart-section__chevron" style={{ color: accent }}>{open ? '▲' : '▼'}</span>
        </button>
        {action && <div style={{ marginLeft: 8, flexShrink: 0 }}>{action}</div>}
      </div>
      {open && <div className="chart-section__body">{children}</div>}
    </div>
  )
}

// ── Soil Moisture ────────────────────────────────────────

type Depth = '0_to_1cm' | '1_to_3cm' | '3_to_9cm' | '9_to_27cm'

const DEPTH_LABELS: Record<Depth, string> = {
  '0_to_1cm':  '0–1 cm',
  '1_to_3cm':  '1–3 cm',
  '3_to_9cm':  '3–9 cm',
  '9_to_27cm': '9–27 cm',
}

interface SoilRow { date: string; value: number }
type RegionData = { rows: SoilRow[]; loading: boolean }

function fetchSoil(lat: number, lng: number, depth: Depth): Promise<SoilRow[]> {
  const variable = `soil_moisture_${depth}`
  return fetch(
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&hourly=${variable}&forecast_days=7&timezone=auto`
  )
    .then(r => r.json())
    .then(data => {
      const times:  string[] = data?.hourly?.time       ?? []
      const values: number[] = data?.hourly?.[variable] ?? []
      const days: Record<string, number[]> = {}
      times.forEach((t, i) => {
        const day = t.slice(0, 10)
        if (!days[day]) days[day] = []
        if (values[i] != null) days[day].push(values[i])
      })
      return Object.entries(days).map(([date, vals]) => ({
        date,
        value: vals.reduce((s, v) => s + v, 0) / vals.length,
      }))
    })
}

function SoilSparkline({ rows, color }: { rows: SoilRow[]; color: string }) {
  const W = 72, H = 24
  const vals  = rows.map(r => r.value)
  const min   = Math.min(...vals)
  const max   = Math.max(...vals)
  const range = max - min || 0.001
  const xS = (i: number) => (i / (rows.length - 1)) * W
  const yS = (v: number) => H - 2 - ((v - min) / range) * (H - 4)
  const pts  = rows.map((r, i) => `${xS(i)},${yS(r.value)}`).join(' ')
  const last = rows[rows.length - 1]
  return (
    <svg width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`${color}18`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx={xS(rows.length - 1)} cy={yS(last.value)} r={2} fill={color} />
    </svg>
  )
}

function SoilMoistureSection() {
  const [depth,    setDepth]    = useState<Depth>('0_to_1cm')
  const [data,     setData]     = useState<Record<string, RegionData>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback((d: Depth) => {
    setData(prev => {
      const next: Record<string, RegionData> = {}
      REGIONS.forEach(r => { next[r.id] = { rows: prev[r.id]?.rows ?? [], loading: true } })
      return next
    })
    REGIONS.forEach(region => {
      fetchSoil(region.lat, region.lng, d)
        .then(rows => setData(prev => ({ ...prev, [region.id]: { rows, loading: false } })))
        .catch(()  => setData(prev => ({ ...prev, [region.id]: { rows: [], loading: false } })))
    })
  }, [])

  useEffect(() => { load(depth) }, [depth, load])

  const moistureColor = (v: number) => v < 0.15 ? '#c8a96e' : v < 0.30 ? '#4a9eff' : '#2ecc71'

  return (
    <>
      <div className="soil-depth-tabs" style={{ marginBottom: 6 }}>
        {(Object.keys(DEPTH_LABELS) as Depth[]).map(d => (
          <button
            key={d}
            className={`soil-depth-tab${depth === d ? ' soil-depth-tab--active' : ''}`}
            onClick={() => setDepth(d)}
          >
            {DEPTH_LABELS[d]}
          </button>
        ))}
      </div>

      <div className="soil-rows">
        {REGIONS.map(region => {
          const rd     = data[region.id]
          const rows   = rd?.rows ?? []
          const last   = rows[rows.length - 1]
          const color  = last ? moistureColor(last.value) : '#4a5568'
          const isOpen = expanded === region.id

          return (
            <div
              key={region.id}
              className={`soil-row${isOpen ? ' soil-row--open' : ''}`}
              onClick={() => setExpanded(isOpen ? null : region.id)}
            >
              <div className="soil-row__summary">
                <div className="soil-row__label">{region.label}</div>
                {rd?.loading && <div className="soil-row__loading">·</div>}
                {!rd?.loading && rows.length > 0 && (
                  <>
                    <SoilSparkline rows={rows} color={color} />
                    <div className="soil-row__val" style={{ color }}>
                      {last.value.toFixed(3)}<span className="soil-row__unit"> m³/m³</span>
                    </div>
                  </>
                )}
                {!rd?.loading && rows.length === 0 && <div className="soil-row__loading">n/a</div>}
                <span className="soil-row__chevron">{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && rows.length > 0 && (
                <div className="soil-row__detail">
                  <svg width="100%" viewBox="0 0 200 56" preserveAspectRatio="none" style={{ display: 'block', height: 56 }}>
                    {(() => {
                      const vals  = rows.map(r => r.value)
                      const min   = Math.min(...vals)
                      const max   = Math.max(...vals)
                      const range = max - min || 0.001
                      const xS = (i: number) => (i / (rows.length - 1)) * 200
                      const yS = (v: number) => 48 - ((v - min) / range) * 42
                      const pts = rows.map((r, i) => `${xS(i)},${yS(r.value)}`).join(' ')
                      return (
                        <>
                          <polygon points={`0,48 ${pts} 200,48`} fill={`${color}18`} />
                          <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
                          {rows.map((r, i) => <circle key={i} cx={xS(i)} cy={yS(r.value)} r={2.5} fill={color} />)}
                        </>
                      )
                    })()}
                  </svg>
                  <div className="soil-row__days">
                    {rows.map((r, i) => (
                      <div key={i} className="soil-row__day">
                        <span className="soil-row__day-date">{r.date.slice(5)}</span>
                        <span className="soil-row__day-val" style={{ color }}>{r.value.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="soil-section__legend">
        <span style={{ color: '#c8a96e' }}>● dry</span>
        <span style={{ color: '#4a9eff' }}>● moist</span>
        <span style={{ color: '#2ecc71' }}>● wet</span>
        <span style={{ color: '#4a5568', marginLeft: 'auto' }}>7-day</span>
      </div>
    </>
  )
}

// ── Rainfall ─────────────────────────────────────────────

type RainRange = '7d' | '1m' | '1y'

const RAIN_RANGE_LABELS: Record<RainRange, string> = {
  '7d': '7 Days',
  '1m': '1 Month',
  '1y': '1 Year',
}

interface RainRow { date: string; rain: number }
type RainRegionData = { rows: RainRow[]; loading: boolean }

function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

function fetchRain(lat: number, lng: number, range: RainRange): Promise<RainRow[]> {
  const today = new Date()
  const parse = (data: { daily?: { time?: string[]; precipitation_sum?: number[] } }): RainRow[] => {
    const dates  = data?.daily?.time              ?? []
    const values = data?.daily?.precipitation_sum ?? []
    return dates.map((d: string, i: number) => ({ date: d, rain: values[i] ?? 0 }))
  }

  if (range === '7d') {
    return fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&daily=precipitation_sum&forecast_days=7&timezone=auto`
    ).then(r => r.json()).then(parse)
  }

  // For month/year use the archive API (historical data up to yesterday)
  const end = new Date(today)
  end.setDate(end.getDate() - 1)
  const start = new Date(today)
  if (range === '1m') start.setMonth(start.getMonth() - 1)
  else                start.setFullYear(start.getFullYear() - 1)

  return fetch(
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lng}` +
    `&daily=precipitation_sum` +
    `&start_date=${toISO(start)}&end_date=${toISO(end)}&timezone=auto`
  ).then(r => r.json()).then(parse)
}

function RainSparkline({ rows, color }: { rows: RainRow[]; color: string }) {
  const W = 72, H = 24
  if (rows.length < 2) return <svg width={W} height={H} />
  const vals  = rows.map(r => r.rain)
  const max   = Math.max(...vals, 1)
  const xS = (i: number) => (i / (rows.length - 1)) * W
  const yS = (v: number) => H - 2 - (v / max) * (H - 4)
  const pts  = rows.map((r, i) => `${xS(i)},${yS(r.rain)}`).join(' ')
  const last = rows[rows.length - 1]
  return (
    <svg width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`${color}18`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx={xS(rows.length - 1)} cy={yS(last.rain)} r={2} fill={color} />
    </svg>
  )
}

function RainfallSection() {
  const [range,    setRange]    = useState<RainRange>('7d')
  const [data,     setData]     = useState<Record<string, RainRegionData>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback((r: RainRange) => {
    setData(prev => {
      const next: Record<string, RainRegionData> = {}
      REGIONS.forEach(reg => { next[reg.id] = { rows: prev[reg.id]?.rows ?? [], loading: true } })
      return next
    })
    REGIONS.forEach(region => {
      fetchRain(region.lat, region.lng, r)
        .then(rows => setData(prev => ({ ...prev, [region.id]: { rows, loading: false } })))
        .catch(()  => setData(prev => ({ ...prev, [region.id]: { rows: [], loading: false } })))
    })
  }, [])

  useEffect(() => { load(range) }, [range, load])

  const rainColor = (v: number) => v < 1 ? '#4a5568' : v < 10 ? '#74B9FF' : '#4a9eff'

  // For year view, thin out labels to every ~30th point
  const labelStride = range === '1y' ? 30 : range === '1m' ? 3 : 1

  return (
    <>
      <div className="soil-depth-tabs" style={{ marginBottom: 6 }}>
        {(Object.keys(RAIN_RANGE_LABELS) as RainRange[]).map(r => (
          <button
            key={r}
            className={`soil-depth-tab${range === r ? ' soil-depth-tab--active' : ''}`}
            onClick={() => setRange(r)}
          >
            {RAIN_RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="soil-rows">
        {REGIONS.map(region => {
          const rd     = data[region.id]
          const rows   = rd?.rows ?? []
          const last   = rows[rows.length - 1]
          const color  = last ? rainColor(last.rain) : '#4a5568'
          const total  = rows.reduce((s, r) => s + r.rain, 0)
          const isOpen = expanded === region.id

          return (
            <div
              key={region.id}
              className={`soil-row${isOpen ? ' soil-row--open' : ''}`}
              onClick={() => setExpanded(isOpen ? null : region.id)}
            >
              <div className="soil-row__summary">
                <div className="soil-row__label">{region.label}</div>
                {rd?.loading && <div className="soil-row__loading">·</div>}
                {!rd?.loading && rows.length > 0 && (
                  <>
                    <RainSparkline rows={rows} color={color} />
                    <div className="soil-row__val" style={{ color }}>
                      {total.toFixed(0)}<span className="soil-row__unit"> mm</span>
                    </div>
                  </>
                )}
                {!rd?.loading && rows.length === 0 && <div className="soil-row__loading">n/a</div>}
                <span className="soil-row__chevron">{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && rows.length > 0 && (
                <div className="soil-row__detail">
                  <svg width="100%" viewBox="0 0 200 56" preserveAspectRatio="none" style={{ display: 'block', height: 56 }}>
                    {(() => {
                      const vals  = rows.map(r => r.rain)
                      const max   = Math.max(...vals, 1)
                      const xS = (i: number) => (i / (rows.length - 1)) * 200
                      const yS = (v: number) => 48 - (v / max) * 42
                      const pts = rows.map((r, i) => `${xS(i)},${yS(r.rain)}`).join(' ')
                      return (
                        <>
                          <polygon points={`0,48 ${pts} 200,48`} fill={`${color}18`} />
                          <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
                          {rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 14)) === 0).map((r, i) => (
                            <circle key={i} cx={xS(rows.indexOf(r))} cy={yS(r.rain)} r={2.5} fill={rainColor(r.rain)} />
                          ))}
                        </>
                      )
                    })()}
                  </svg>
                  <div className="soil-row__days">
                    {rows.filter((_, i) => i % labelStride === 0).map((r, i) => (
                      <div key={i} className="soil-row__day">
                        <span className="soil-row__day-date">{r.date.slice(range === '1y' ? 0 : 5)}</span>
                        <span className="soil-row__day-val" style={{ color: rainColor(r.rain) }}>{r.rain.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div className="soil-section__legend">
          <span style={{ color: '#4a5568' }}>● dry</span>
          <span style={{ color: '#74B9FF' }}>● light</span>
          <span style={{ color: '#4a9eff' }}>● heavy</span>
          <span style={{ color: '#4a5568', marginLeft: 'auto' }}>total mm</span>
        </div>
      </div>
    </>
  )
}

// ── Drought Index (ET0) ──────────────────────────────────

interface ET0Row { date: string; et0: number }
type ET0RegionData = { rows: ET0Row[]; loading: boolean }

function fetchET0(lat: number, lng: number): Promise<ET0Row[]> {
  return fetch(
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&daily=et0_fao_evapotranspiration&forecast_days=14&timezone=auto`
  )
    .then(r => r.json())
    .then(data => {
      const dates  = data?.daily?.time                       ?? []
      const values = data?.daily?.et0_fao_evapotranspiration ?? []
      return dates.map((d: string, i: number) => ({ date: d, et0: values[i] ?? 0 }))
    })
}

function ET0Sparkline({ rows, color }: { rows: ET0Row[]; color: string }) {
  const W = 72, H = 24
  const vals  = rows.map(r => r.et0)
  const min   = 0
  const max   = Math.max(...vals, 1)
  const range = max - min
  const xS = (i: number) => (i / (rows.length - 1)) * W
  const yS = (v: number) => H - 2 - ((v - min) / range) * (H - 4)
  const pts  = rows.map((r, i) => `${xS(i)},${yS(r.et0)}`).join(' ')
  const last = rows[rows.length - 1]
  return (
    <svg width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`${color}18`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx={xS(rows.length - 1)} cy={yS(last.et0)} r={2} fill={color} />
    </svg>
  )
}

function DroughtSection() {
  const [data,     setData]     = useState<Record<string, ET0RegionData>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    setData(prev => {
      const next: Record<string, ET0RegionData> = {}
      REGIONS.forEach(r => { next[r.id] = { rows: prev[r.id]?.rows ?? [], loading: true } })
      return next
    })
    REGIONS.forEach(region => {
      fetchET0(region.lat, region.lng)
        .then(rows => setData(prev => ({ ...prev, [region.id]: { rows, loading: false } })))
        .catch(()  => setData(prev => ({ ...prev, [region.id]: { rows: [], loading: false } })))
    })
  }, [])

  // colour: low ET0 = blue (cool/wet), high = orange (dry/hot)
  const et0Color = (v: number, max: number) =>
    v > max * 0.7 ? '#e8855a' : v > max * 0.4 ? '#c8a96e' : '#4a9eff'

  return (
    <div className="soil-rows">
      {REGIONS.map(region => {
        const rd     = data[region.id]
        const rows   = rd?.rows ?? []
        const last   = rows[rows.length - 1]
        const maxVal = Math.max(...rows.map(r => r.et0), 1)
        const color  = last ? et0Color(last.et0, maxVal) : '#4a5568'
        const isOpen = expanded === region.id

        return (
          <div
            key={region.id}
            className={`soil-row${isOpen ? ' soil-row--open' : ''}`}
            onClick={() => setExpanded(isOpen ? null : region.id)}
          >
            <div className="soil-row__summary">
              <div className="soil-row__label">{region.label}</div>
              {rd?.loading && <div className="soil-row__loading">·</div>}
              {!rd?.loading && rows.length > 0 && (
                <>
                  <ET0Sparkline rows={rows} color={color} />
                  <div className="soil-row__val" style={{ color }}>
                    {last.et0.toFixed(1)}<span className="soil-row__unit"> mm</span>
                  </div>
                </>
              )}
              {!rd?.loading && rows.length === 0 && <div className="soil-row__loading">n/a</div>}
              <span className="soil-row__chevron">{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && rows.length > 0 && (
              <div className="soil-row__detail">
                <svg width="100%" viewBox="0 0 200 56" preserveAspectRatio="none" style={{ display: 'block', height: 56 }}>
                  {(() => {
                    const vals  = rows.map(r => r.et0)
                    const min   = 0
                    const max   = Math.max(...vals, 1)
                    const range = max - min
                    const xS = (i: number) => (i / (rows.length - 1)) * 200
                    const yS = (v: number) => 48 - ((v - min) / range) * 42
                    const pts = rows.map((r, i) => `${xS(i)},${yS(r.et0)}`).join(' ')
                    return (
                      <>
                        <polygon points={`0,48 ${pts} 200,48`} fill={`${color}18`} />
                        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
                        {rows.map((r, i) => <circle key={i} cx={xS(i)} cy={yS(r.et0)} r={2.5} fill={et0Color(r.et0, max)} />)}
                      </>
                    )
                  })()}
                </svg>
                <div className="soil-row__days">
                  {rows.filter((_, i) => i % 2 === 0).map((r, i) => (
                    <div key={i} className="soil-row__day">
                      <span className="soil-row__day-date">{r.date.slice(5)}</span>
                      <span className="soil-row__day-val" style={{ color: et0Color(r.et0, maxVal) }}>{r.et0.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
      <div className="soil-section__legend">
        <span style={{ color: '#4a9eff' }}>● low</span>
        <span style={{ color: '#c8a96e' }}>● moderate</span>
        <span style={{ color: '#e8855a' }}>● high stress</span>
        <span style={{ color: '#4a5568', marginLeft: 'auto' }}>14-day</span>
      </div>
    </div>
  )
}

// ── Sunshine Duration ────────────────────────────────────

interface SunRow { date: string; hours: number }
type SunRegionData = { rows: SunRow[]; loading: boolean }

function fetchSunshine(lat: number, lng: number, range: RainRange): Promise<SunRow[]> {
  const parse = (data: { daily?: { time?: string[]; sunshine_duration?: number[] } }): SunRow[] => {
    const dates   = data?.daily?.time              ?? []
    const seconds = data?.daily?.sunshine_duration ?? []
    return dates.map((d: string, i: number) => ({ date: d, hours: (seconds[i] ?? 0) / 3600 }))
  }

  if (range === '7d') {
    return fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&daily=sunshine_duration&forecast_days=7&timezone=auto`
    ).then(r => r.json()).then(parse)
  }

  const end = new Date()
  end.setDate(end.getDate() - 1)
  const start = new Date()
  if (range === '1m') start.setMonth(start.getMonth() - 1)
  else                start.setFullYear(start.getFullYear() - 1)

  return fetch(
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lng}` +
    `&daily=sunshine_duration` +
    `&start_date=${toISO(start)}&end_date=${toISO(end)}&timezone=auto`
  ).then(r => r.json()).then(parse)
}

function SunSparkline({ rows, color }: { rows: SunRow[]; color: string }) {
  const W = 72, H = 24
  if (rows.length < 2) return <svg width={W} height={H} />
  const vals = rows.map(r => r.hours)
  const max  = Math.max(...vals, 1)
  const xS = (i: number) => (i / (rows.length - 1)) * W
  const yS = (v: number) => H - 2 - (v / max) * (H - 4)
  const pts = rows.map((r, i) => `${xS(i)},${yS(r.hours)}`).join(' ')
  const last = rows[rows.length - 1]
  return (
    <svg width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`${color}18`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx={xS(rows.length - 1)} cy={yS(last.hours)} r={2} fill={color} />
    </svg>
  )
}

function SunshineSection() {
  const [range,    setRange]    = useState<RainRange>('7d')
  const [data,     setData]     = useState<Record<string, SunRegionData>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback((r: RainRange) => {
    setData(prev => {
      const next: Record<string, SunRegionData> = {}
      REGIONS.forEach(reg => { next[reg.id] = { rows: prev[reg.id]?.rows ?? [], loading: true } })
      return next
    })
    REGIONS.forEach(region => {
      fetchSunshine(region.lat, region.lng, r)
        .then(rows => setData(prev => ({ ...prev, [region.id]: { rows, loading: false } })))
        .catch(()  => setData(prev => ({ ...prev, [region.id]: { rows: [], loading: false } })))
    })
  }, [])

  useEffect(() => { load(range) }, [range, load])

  const sunColor = (v: number) => v < 3 ? '#4a5568' : v < 7 ? '#c8a96e' : '#f9ca24'
  const labelStride = range === '1y' ? 30 : range === '1m' ? 3 : 1

  return (
    <>
      <div className="soil-depth-tabs" style={{ marginBottom: 6 }}>
        {(Object.keys(RAIN_RANGE_LABELS) as RainRange[]).map(r => (
          <button
            key={r}
            className={`soil-depth-tab${range === r ? ' soil-depth-tab--active' : ''}`}
            onClick={() => setRange(r)}
          >
            {RAIN_RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="soil-rows">
        {REGIONS.map(region => {
          const rd     = data[region.id]
          const rows   = rd?.rows ?? []
          const last   = rows[rows.length - 1]
          const color  = last ? sunColor(last.hours) : '#4a5568'
          const isOpen = expanded === region.id

          return (
            <div
              key={region.id}
              className={`soil-row${isOpen ? ' soil-row--open' : ''}`}
              onClick={() => setExpanded(isOpen ? null : region.id)}
            >
              <div className="soil-row__summary">
                <div className="soil-row__label">{region.label}</div>
                {rd?.loading && <div className="soil-row__loading">·</div>}
                {!rd?.loading && rows.length > 0 && (
                  <>
                    <SunSparkline rows={rows} color={color} />
                    <div className="soil-row__val" style={{ color }}>
                      {last.hours.toFixed(1)}<span className="soil-row__unit"> hrs</span>
                    </div>
                  </>
                )}
                {!rd?.loading && rows.length === 0 && <div className="soil-row__loading">n/a</div>}
                <span className="soil-row__chevron">{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && rows.length > 0 && (
                <div className="soil-row__detail">
                  <svg width="100%" viewBox="0 0 200 56" preserveAspectRatio="none" style={{ display: 'block', height: 56 }}>
                    {(() => {
                      const vals = rows.map(r => r.hours)
                      const max  = Math.max(...vals, 1)
                      const xS = (i: number) => (i / (rows.length - 1)) * 200
                      const yS = (v: number) => 48 - (v / max) * 42
                      const pts = rows.map((r, i) => `${xS(i)},${yS(r.hours)}`).join(' ')
                      return (
                        <>
                          <polygon points={`0,48 ${pts} 200,48`} fill={`${color}18`} />
                          <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
                          {rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 14)) === 0).map((r, i) => (
                            <circle key={i} cx={xS(rows.indexOf(r))} cy={yS(r.hours)} r={2.5} fill={sunColor(r.hours)} />
                          ))}
                        </>
                      )
                    })()}
                  </svg>
                  <div className="soil-row__days">
                    {rows.filter((_, i) => i % labelStride === 0).map((r, i) => (
                      <div key={i} className="soil-row__day">
                        <span className="soil-row__day-date">{r.date.slice(range === '1y' ? 0 : 5)}</span>
                        <span className="soil-row__day-val" style={{ color: sunColor(r.hours) }}>{r.hours.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div className="soil-section__legend">
          <span style={{ color: '#4a5568' }}>● cloudy</span>
          <span style={{ color: '#c8a96e' }}>● partial</span>
          <span style={{ color: '#f9ca24' }}>● sunny</span>
          <span style={{ color: '#4a5568', marginLeft: 'auto' }}>hrs/day</span>
        </div>
      </div>
    </>
  )
}

// ── Strategy Simulator ───────────────────────────────────

interface PriceRow {
  date:  string
  price: number
}

interface TradeRow {
  entry:     string   // entry date
  exit:      string   // exit date
  direction: 'LONG' | 'SHORT'
  price:     number   // weat_price at entry
  cumNet:    number   // cum_net at exit
  cumBH:     number   // cum_bh at exit
  netRet:    number   // net_ret
}

function parseTradesCSV(text: string): TradeRow[] {
  const lines = text.trim().split('\n')
  // header: year,entry,exit,direction,months,avg_pos,total_ret,best_mo,worst_mo,weat_price,signal,signal_decayed,position,net_ret,gross_ret,cum_net,cum_bh
  return lines.slice(1).map(line => {
    const c = line.split(',')
    return {
      entry:     c[1],
      exit:      c[2],
      direction: c[3].trim() as 'LONG' | 'SHORT',
      price:     parseFloat(c[9]),
      cumNet:    parseFloat(c[15]),
      cumBH:     parseFloat(c[16]),
      netRet:    parseFloat(c[13]),
    }
  })
  .filter(r => r.entry && !isNaN(r.price))
  .sort((a, b) => a.exit.localeCompare(b.exit))
}

function parsePricesCSV(text: string): PriceRow[] {
  const lines = text.trim().split('\n')
  // header: permno,date,ticker,comnam,prc,vol,ret,bid,ask,shrout,openprc,askhi,bidlo,year,month,day_of_week,market_cap_millions,bid_ask_spread,bid_ask_spread_pct
  return lines.slice(1)
    .map(line => {
      const c = line.split(',')
      return { date: c[1], price: parseFloat(c[4]) }
    })
    .filter(r => r.date && !isNaN(r.price))
}

interface SimulatorState {
  rows:       TradeRow[]
  step:       number
  running:    boolean
  started:    boolean
  speed:      number
  onRun:      () => void
  onReset:    () => void
  onSpeed:    (v: number) => void
}

function SimulatorChart({ modal, sim }: { modal: boolean; sim: SimulatorState }) {
  const [prices, setPrices] = useState<PriceRow[]>([])

  useEffect(() => {
    fetch('/WEAT_stock_prices.csv')
      .then(r => r.text())
      .then(t => setPrices(parsePricesCSV(t)))
      .catch(() => {})
  }, [])

  if (prices.length === 0 || sim.rows.length === 0) 
    return <div style={{ fontSize: 11, color: '#4a5568', padding: 8 }}>Loading data…</div>

  const W = 600, H = modal ? 200 : 110, PL = 38, PB = 22, PT = 8, PR = 8
  const iW = W - PL - PR
  const iH = H - PT - PB

  // Map trades to price indices
  const tradeMarks = sim.rows.map(trade => {
    const entryIdx = prices.findIndex(p => p.date >= trade.entry)
    const exitIdx = prices.findIndex(p => p.date >= trade.exit)
    return { trade, entryIdx, exitIdx }
  }).filter(t => t.entryIdx >= 0 && t.exitIdx >= 0)

  // Calculate scales
  const priceVals = prices.map(p => p.price)
  const minPrice = Math.min(...priceVals)
  const maxPrice = Math.max(...priceVals)
  const priceRange = maxPrice - minPrice || 0.1

  const xScale = (i: number) => PL + (i / (prices.length - 1)) * iW
  const yScale = (v: number) => PT + iH - ((v - minPrice) / priceRange) * iH

  // Year ticks
  const yearTicks: { year: string; x: number }[] = []
  let lastYear = ''
  prices.forEach((p, i) => {
    const yr = p.date.slice(0, 4)
    if (yr !== lastYear) { yearTicks.push({ year: yr, x: xScale(i) }); lastYear = yr }
  })

  // Triangles for entry/exit
  const upTri = (cx: number, cy: number) =>
    <polygon points={`${cx},${cy - 5} ${cx - 3.5},${cy + 2.5} ${cx + 3.5},${cy + 2.5}`} fill="#2ecc71" stroke="rgba(0,0,0,0.5)" strokeWidth={0.5} />
  const downTri = (cx: number, cy: number) =>
    <polygon points={`${cx},${cy + 5} ${cx - 3.5},${cy - 2.5} ${cx + 3.5},${cy - 2.5}`} fill="#e74c3c" stroke="rgba(0,0,0,0.5)" strokeWidth={0.5} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ fontSize: 9, color: '#4a5568', letterSpacing: '0.08em', marginBottom: 2, flexShrink: 0 }}>WEAT PRICE · with trade signals</div>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', flex: 1, minHeight: 0 }}>
          {/* Y-axis labels */}
          {[minPrice, (minPrice + maxPrice) / 2, maxPrice].map((v, i) => (
            <text key={i} x={PL - 3} y={yScale(v) + 3} textAnchor="end" fontSize={7} fill="#4a5568">${v.toFixed(1)}</text>
          ))}

          {/* Price line */}
          <polyline points={prices.map((p, i) => `${xScale(i)},${yScale(p.price)}`).join(' ')} fill="none" stroke="#74B9FF" strokeWidth="1.5" />

          {/* Trade markers */}
          {tradeMarks.map((tm, idx) => (
            <g key={idx}>
              {/* Entry triangle */}
              {upTri(xScale(tm.entryIdx), yScale(prices[tm.entryIdx].price))}
              {/* Exit triangle */}
              {tm.trade.direction === 'LONG' 
                ? downTri(xScale(tm.exitIdx), yScale(prices[tm.exitIdx].price))
                : upTri(xScale(tm.exitIdx), yScale(prices[tm.exitIdx].price))
              }
              {/* Trade line */}
              <line 
                x1={xScale(tm.entryIdx)} 
                y1={yScale(prices[tm.entryIdx].price)} 
                x2={xScale(tm.exitIdx)} 
                y2={yScale(prices[tm.exitIdx].price)} 
                stroke={tm.trade.direction === 'LONG' ? '#2ecc71' : '#e74c3c'}
                strokeWidth="0.8"
                opacity="0.4"
              />
            </g>
          ))}

          {/* X-axis */}
          <line x1={PL} y1={PT + iH} x2={W - PR} y2={PT + iH} stroke="rgba(74, 85, 104, 0.3)" strokeWidth="1" />
          {yearTicks.map((tick, i) => (
            <g key={i}>
              <line x1={tick.x} y1={PT + iH} x2={tick.x} y2={PT + iH + 3} stroke="rgba(74, 85, 104, 0.3)" strokeWidth="1" />
              <text x={tick.x} y={PT + iH + 14} textAnchor="middle" fontSize={7} fill="#4a5568">{tick.year}</text>
            </g>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, fontSize: 9, color: '#4a5568', flexShrink: 0 }}>
        <span style={{ color: '#74B9FF' }}>─ WEAT Price</span>
        <span style={{ color: '#2ecc71' }}>▲ Entry</span>
        <span style={{ color: '#e74c3c' }}>▼ Exit</span>
        <span style={{ color: '#2ecc71' }}>─ Long Trade</span>
        <span style={{ color: '#e74c3c' }}>─ Short Trade</span>
      </div>
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────

interface GraphPanelProps {
  activeQuery: string
  collapsed: boolean
  onToggle: () => void
}

export default function GraphPanel({ activeQuery, collapsed, onToggle }: GraphPanelProps) {
  const [sentiment, setSentiment] = useState<SentimentResult | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [expanded,  setExpanded]  = useState(false)

  // ── Simulator state (shared between inline + modal) ──
  const [simRows,    setSimRows]    = useState<TradeRow[]>([])
  const [simStep,    setSimStep]    = useState(0)
  const [simRunning, setSimRunning] = useState(false)
  const [simStarted, setSimStarted] = useState(false)
  const [simSpeed,   setSimSpeed]   = useState(300)
  const simIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch('/FINAL_trades.csv')
      .then(r => r.text())
      .then(t => setSimRows(parseTradesCSV(t)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (simRunning) {
      simIntervalRef.current = setInterval(() => {
        setSimStep(s => {
          if (s >= simRows.length - 1) { setSimRunning(false); return s }
          return s + 1
        })
      }, simSpeed)
    } else {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current)
    }
    return () => { if (simIntervalRef.current) clearInterval(simIntervalRef.current) }
  }, [simRunning, simSpeed, simRows.length])

  const simState: SimulatorState = {
    rows:    simRows,
    step:    simStep,
    running: simRunning,
    started: simStarted,
    speed:   simSpeed,
    onRun:   () => {
      if (!simStarted) { setSimStep(0); setSimStarted(true); setSimRunning(true) }
      else setSimRunning(v => !v)
    },
    onReset: () => { setSimRunning(false); setSimStarted(false); setSimStep(0) },
    onSpeed: (v) => setSimSpeed(v),
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    setSentiment(null)
    const q = encodeURIComponent(activeQuery)
    fetch(`http://localhost:8000/api/sentiment?crop=${q}&limit=10`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setSentiment)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [activeQuery])

  return (
    <aside className={`panel panel--graph${collapsed ? ' panel--collapsed' : ''}`}>

      <div className="panel__content">
        <div className="panel__body" style={{ flex: 1, overflowY: 'auto' }}>

          <Section
            title="Strategy Simulator · WEAT"
            accent="#2ecc71"
            action={
              <button
                onClick={() => setExpanded(true)}
                title="Open full simulator"
                style={{
                  background: 'none', border: '1px solid #2a3a28',
                  color: '#2ecc71', borderRadius: 3,
                  padding: '2px 7px', fontSize: 10, cursor: 'pointer',
                  letterSpacing: '0.06em', lineHeight: 1.4,
                }}
              >
                ⊞ expand
              </button>
            }
          >
            <SimulatorChart modal={false} sim={simState} />
          </Section>

          <Section title="Soil Moisture" accent="#4a9eff">
            <SoilMoistureSection />
          </Section>

          <Section title="Rainfall" accent="#74B9FF">
            <RainfallSection />
          </Section>

          <Section title="Sunshine Duration" accent="#f9ca24">
            <SunshineSection />
          </Section>

          <Section title="Drought Index · ET₀" accent="#e8855a">
            <DroughtSection />
          </Section>

        </div>

        {/* Sentiment */}
        <div style={{
          margin: '0 12px 12px', padding: '12px 14px',
          background: 'rgba(13, 16, 23, 0.6)',
          border: '1px solid rgba(30, 35, 48, 0.8)',
          borderRadius: 4, flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4a5568', marginBottom: 10 }}>
            Sentiment
          </div>
          {loading && <p style={{ fontSize: 11, color: '#4a5568', margin: 0 }}>Analysing…</p>}
          {error   && <p style={{ fontSize: 11, color: '#e05',    margin: 0 }}>Error: {error}</p>}
          {sentiment && !loading && (() => {
            const colour = SENTIMENT_COLOUR[sentiment.sentiment]
            const pct    = Math.round(Math.abs(sentiment.score) * 100)
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: colour, letterSpacing: '0.04em' }}>
                    {sentiment.sentiment.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 13, color: colour, opacity: 0.8 }}>
                    {sentiment.score >= 0 ? '+' : ''}{sentiment.score.toFixed(3)}
                  </span>
                </div>
                <div style={{ height: 4, background: 'rgba(30,35,48,0.8)', borderRadius: 2, marginBottom: 8, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.15)' }} />
                  <div style={{
                    position: 'absolute', top: 0, height: '100%',
                    width: `${pct / 2}%`,
                    ...(sentiment.score >= 0 ? { left: '50%' } : { right: '50%' }),
                    background: colour, borderRadius: 2, transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: '#4a5568' }}>
                  {sentiment.articles_analysed} articles · <span style={{ color: '#636e72' }}>{sentiment.crop}</span>
                </div>
              </>
            )
          })()}
        </div>
      </div>

      <div className="panel__collapse-strip" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
        {collapsed ? '›' : '‹'}
      </div>

      {expanded && createPortal(
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '80vw', height: '85vh',
              background: '#0a0c10',
              border: '1px solid rgba(30,35,48,0.9)',
              borderRadius: 6,
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 8px 48px rgba(0,0,0,0.8)',
              overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px',
              borderBottom: '1px solid rgba(30,35,48,0.8)',
              background: 'rgba(13,16,23,0.6)', flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4a5568' }}>
                Strategy Simulator · WEAT
              </span>
              <button
                onClick={() => setExpanded(false)}
                style={{ background: 'none', border: 'none', color: '#4a5568', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            {/* Modal body — full-size simulator */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 16px' }}>
              <SimulatorChart modal={true} sim={simState} />
            </div>
          </div>
        </div>,
        document.body
      )}

    </aside>
  )
}
