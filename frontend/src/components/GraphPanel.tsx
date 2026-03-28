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

// ── Soil moisture ────────────────────────────────────────

interface Region {
  id: string
  label: string
  lat: number
  lng: number
}

const REGIONS: Region[] = [
  { id: 'california', label: 'California', lat: 36.7,  lng: -119.4 },
  { id: 'kansas',     label: 'Kansas',     lat: 38.5,  lng: -98.0  },
  { id: 'ukraine',    label: 'Ukraine',    lat: 49.0,  lng: 32.0   },
  { id: 'india',      label: 'India',      lat: 20.0,  lng: 78.9   },
  { id: 'australia',  label: 'Australia',  lat: -25.0, lng: 133.0  },
]

type Depth = '0_to_1cm' | '1_to_3cm' | '3_to_9cm' | '9_to_27cm'

const DEPTH_LABELS: Record<Depth, string> = {
  '0_to_1cm':  '0–1 cm',
  '1_to_3cm':  '1–3 cm',
  '3_to_9cm':  '3–9 cm',
  '9_to_27cm': '9–27 cm',
}

interface SoilRow {
  date: string
  value: number
}

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

function Sparkline({ rows, color }: { rows: SoilRow[]; color: string }) {
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

type RegionData = { rows: SoilRow[]; loading: boolean }

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

  const moistureColor = (v: number) => {
    if (v < 0.15) return '#c8a96e'
    if (v < 0.30) return '#4a9eff'
    return '#2ecc71'
  }

  return (
    <div className="soil-section">
      <div className="soil-section__header">
        <span className="panel__title">Soil Moisture</span>
        <div className="soil-depth-tabs">
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
                    <Sparkline rows={rows} color={color} />
                    <div className="soil-row__val" style={{ color }}>
                      {last.value.toFixed(3)}
                      <span className="soil-row__unit"> m³/m³</span>
                    </div>
                  </>
                )}

                {!rd?.loading && rows.length === 0 && (
                  <div className="soil-row__loading">n/a</div>
                )}

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
                          {rows.map((r, i) => (
                            <circle key={i} cx={xS(i)} cy={yS(r.value)} r={2.5} fill={color} />
                          ))}
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
        <span style={{ color: '#4a5568', marginLeft: 'auto' }}>7-day forecast</span>
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
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

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
        <div className="panel__body" style={{ flex: 1 }}>
          <SoilMoistureSection />
        </div>

        <div style={{
          margin: '0 12px 12px',
          padding: '12px 14px',
          background: 'rgba(13, 16, 23, 0.6)',
          border: '1px solid rgba(30, 35, 48, 0.8)',
          borderRadius: 4,
          flexShrink: 0,
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
