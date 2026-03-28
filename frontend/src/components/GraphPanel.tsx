import { useEffect, useState } from 'react'

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

export default function GraphPanel({ activeQuery }: { activeQuery: string }) {
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
    <aside className="panel panel--graph" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel__header">
        <span className="panel__title">Chart</span>
      </div>

      {/* upper half — chart placeholder */}
      <div className="panel__body panel__body--empty" style={{ flex: 1 }}>
        {/* graph goes here */}
      </div>

      {/* lower half — sentiment subbox */}
      <div style={{
        margin: '0 12px 12px',
        padding: '12px 14px',
        background: 'rgba(13, 16, 23, 0.6)',
        border: '1px solid rgba(30, 35, 48, 0.8)',
        borderRadius: 4,
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4a5568', marginBottom: 10 }}>
          Sentiment
        </div>

        {loading && (
          <p style={{ fontSize: 11, color: '#4a5568', margin: 0 }}>Analysing…</p>
        )}
        {error && (
          <p style={{ fontSize: 11, color: '#e05', margin: 0 }}>Error: {error}</p>
        )}
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

              {/* score bar */}
              <div style={{ height: 4, background: 'rgba(30,35,48,0.8)', borderRadius: 2, marginBottom: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: colour, borderRadius: 2, transition: 'width 0.4s ease' }} />
              </div>

              <div style={{ fontSize: 10, color: '#4a5568' }}>
                {sentiment.articles_analysed} articles · <span style={{ color: '#636e72' }}>{sentiment.crop}</span>
              </div>
            </>
          )
        })()}
      </div>
    </aside>
  )
}
