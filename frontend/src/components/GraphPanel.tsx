import { useEffect, useState, useCallback } from 'react'

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

function Section({ title, accent = '#4a9eff', children }: { title: string; accent?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="chart-section">
      <button
        className="chart-section__header"
        onClick={() => setOpen(v => !v)}
        style={{ borderLeftColor: accent }}
      >
        <span className="chart-section__title">{title}</span>
        <span className="chart-section__chevron" style={{ color: accent }}>{open ? '▲' : '▼'}</span>
      </button>
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

// ── Main panel ───────────────────────────────────────────

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

    </aside>
  )
}
