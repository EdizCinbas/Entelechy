import { useEffect, useRef, useState } from 'react'

interface Article {
  title: string
  description: string | null
  url: string
}

interface NewsPanelProps {
  pageSize?: number
}

const SORT_OPTIONS = [
  { label: 'Latest', value: 'publishedAt' },
  { label: 'Popular', value: 'popularity' },
  { label: 'Relevant', value: 'relevancy' },
]

const DEFAULT_QUERY = 'wheat supply shortage OR wheat harvest forecast OR wheat futures prices OR wheat export ban OR wheat drought yield'

export default function NewsPanel({ pageSize = 5 }: NewsPanelProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [sortBy, setSortBy] = useState('publishedAt')
  const [input, setInput] = useState('')
  const [activeQuery, setActiveQuery] = useState(DEFAULT_QUERY)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setPage(0)
    const q = encodeURIComponent(activeQuery)
    fetch(`http://localhost:8000/api/news?crop=${q}&limit=30&sort_by=${sortBy}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setArticles)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [sortBy, activeQuery])

  function handleSearch() {
    const trimmed = input.trim()
    if (trimmed) setActiveQuery(trimmed)
  }

  const totalPages = Math.ceil(articles.length / pageSize)
  const visible = articles.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <aside className="panel panel--news" style={{ display: 'flex', flexDirection: 'column' }}>

      {/* header row */}
      <div className="panel__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="panel__title">News Feed</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              style={{
                background: sortBy === opt.value ? '#1a2540' : 'none',
                border: `1px solid ${sortBy === opt.value ? '#4a9eff' : '#1e2330'}`,
                color: sortBy === opt.value ? '#4a9eff' : '#4a5568',
                borderRadius: 3,
                padding: '2px 8px',
                fontSize: 10,
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* search bar */}
      <div style={{
        display: 'flex',
        gap: 6,
        padding: '8px 12px',
        borderBottom: '1px solid rgba(30, 35, 48, 0.5)',
        background: 'rgba(13, 16, 23, 0.2)',
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search commodity news…"
          style={{
            flex: 1,
            background: 'rgba(10, 12, 16, 0.5)',
            border: '1px solid rgba(30, 35, 48, 0.8)',
            borderRadius: 3,
            color: '#c8d0e0',
            fontSize: 11,
            padding: '5px 10px',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSearch}
          style={{
            background: '#1a2540',
            border: '1px solid #4a9eff',
            color: '#4a9eff',
            borderRadius: 3,
            padding: '4px 12px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Go
        </button>
      </div>

      {/* articles */}
      <div className="panel__body" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
        {loading && (
          <p style={{ color: '#4a5568', fontSize: 12, textAlign: 'center', padding: 16 }}>Loading…</p>
        )}
        {error && (
          <p style={{ color: '#e05', fontSize: 12, textAlign: 'center', padding: 16 }}>Error: {error}</p>
        )}
        {!loading && !error && visible.length === 0 && (
          <p style={{ color: '#4a5568', fontSize: 12, textAlign: 'center', padding: 16 }}>No results.</p>
        )}
        {!loading && !error && visible.map((a, i) => (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(30, 35, 48, 0.5)',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontSize: 12, color: '#c8d0e0', lineHeight: 1.4, marginBottom: 4 }}>
              {a.title}
            </div>
            {a.description && (
              <div style={{ fontSize: 11, color: '#4a5568', lineHeight: 1.4 }}>
                {a.description}
              </div>
            )}
          </a>
        ))}
      </div>

      {/* pagination */}
      {!loading && !error && totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderTop: '1px solid rgba(30, 35, 48, 0.5)',
          background: 'rgba(13, 16, 23, 0.3)',
        }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              background: 'none',
              border: '1px solid #1e2330',
              color: page === 0 ? '#2a3348' : '#4a9eff',
              cursor: page === 0 ? 'default' : 'pointer',
              borderRadius: 3,
              padding: '3px 10px',
              fontSize: 11,
            }}
          >
            ‹ Prev
          </button>
          <span style={{ fontSize: 11, color: '#4a5568' }}>{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            style={{
              background: 'none',
              border: '1px solid #1e2330',
              color: page === totalPages - 1 ? '#2a3348' : '#4a9eff',
              cursor: page === totalPages - 1 ? 'default' : 'pointer',
              borderRadius: 3,
              padding: '3px 10px',
              fontSize: 11,
            }}
          >
            Next ›
          </button>
        </div>
      )}
    </aside>
  )
}
