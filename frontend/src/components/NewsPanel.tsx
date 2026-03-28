import { useEffect, useRef, useState } from 'react'

interface Article {
  title: string
  description: string | null
  url: string
}

interface NewsPanelProps {
  activeQuery: string
  onQueryChange: (q: string) => void
  collapsed: boolean
  onToggle: () => void
  pageSize?: number
}

const SORT_OPTIONS = [
  { label: 'Latest',   value: 'publishedAt' },
  { label: 'Popular',  value: 'popularity'  },
  { label: 'Relevant', value: 'relevancy'   },
]

export default function NewsPanel({ activeQuery, onQueryChange, collapsed, onToggle, pageSize = 15 }: NewsPanelProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [page,     setPage]     = useState(0)
  const [sortBy,   setSortBy]   = useState('publishedAt')
  const [input,    setInput]    = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setPage(0)
    setExpanded(null)
    const q = encodeURIComponent(activeQuery)
    fetch(`http://localhost:8000/api/news?crop=${q}&limit=30&sort_by=${sortBy}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setArticles)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [sortBy, activeQuery])

  function handleSearch() {
    const trimmed = input.trim()
    if (trimmed) onQueryChange(trimmed)
  }

  const totalPages = Math.ceil(articles.length / pageSize)
  const visible    = articles.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <aside className={`panel panel--news${collapsed ? ' panel--collapsed' : ''}`}>

      {/* Collapse strip — left edge */}
      <div className="panel__collapse-strip" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
        {collapsed ? '‹' : '›'}
      </div>

      <div className="panel__content">

        {/* Header */}
        <div className="panel__header">
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
                  borderRadius: 3, padding: '2px 8px', fontSize: 10,
                  cursor: 'pointer', letterSpacing: '0.05em',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search bar */}
        <div style={{
          display: 'flex', gap: 6, padding: '8px 12px',
          borderBottom: '1px solid rgba(30, 35, 48, 0.5)',
          background: 'rgba(13, 16, 23, 0.2)', flexShrink: 0,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search commodity news…"
            style={{
              flex: 1, background: 'rgba(10, 12, 16, 0.5)',
              border: '1px solid rgba(30, 35, 48, 0.8)', borderRadius: 3,
              color: '#c8d0e0', fontSize: 11, padding: '5px 10px', outline: 'none',
            }}
          />
          <button
            onClick={handleSearch}
            style={{
              background: '#1a2540', border: '1px solid #4a9eff',
              color: '#4a9eff', borderRadius: 3, padding: '4px 12px',
              fontSize: 11, cursor: 'pointer',
            }}
          >
            Go
          </button>
        </div>

        {/* Articles */}
        <div className="panel__body" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {loading && <p style={{ color: '#4a5568', fontSize: 12, textAlign: 'center', padding: 16 }}>Loading…</p>}
          {error   && <p style={{ color: '#e05',    fontSize: 12, textAlign: 'center', padding: 16 }}>Error: {error}</p>}
          {!loading && !error && visible.length === 0 && (
            <p style={{ color: '#4a5568', fontSize: 12, textAlign: 'center', padding: 16 }}>No results.</p>
          )}
          {!loading && !error && visible.map((a, i) => {
            const globalIdx = page * pageSize + i
            const isOpen    = expanded === globalIdx
            return (
              <div
                key={i}
                onClick={() => setExpanded(isOpen ? null : globalIdx)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(30, 35, 48, 0.5)',
                  cursor: 'pointer',
                  background: isOpen ? 'rgba(74, 158, 255, 0.04)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ fontSize: 12, color: '#c8d0e0', lineHeight: 1.4, flex: 1 }}>
                    {a.title}
                  </div>
                  <span style={{ color: '#2a4060', fontSize: 10, flexShrink: 0, marginTop: 2 }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </div>

                {isOpen && (
                  <div style={{ marginTop: 8 }}>
                    {a.description && (
                      <div style={{ fontSize: 11, color: '#7a9abf', lineHeight: 1.5, marginBottom: 8 }}>
                        {a.description}
                      </div>
                    )}
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{
                        fontSize: 10, color: '#4a9eff', textDecoration: 'none',
                        letterSpacing: '0.05em', fontWeight: 600,
                      }}
                    >
                      Read more →
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {!loading && !error && totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 16px', borderTop: '1px solid rgba(30, 35, 48, 0.5)',
            background: 'rgba(13, 16, 23, 0.3)', flexShrink: 0,
          }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                background: 'none', border: '1px solid #1e2330',
                color: page === 0 ? '#2a3348' : '#4a9eff',
                cursor: page === 0 ? 'default' : 'pointer',
                borderRadius: 3, padding: '3px 10px', fontSize: 11,
              }}
            >‹ Prev</button>
            <span style={{ fontSize: 11, color: '#4a5568' }}>{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              style={{
                background: 'none', border: '1px solid #1e2330',
                color: page === totalPages - 1 ? '#2a3348' : '#4a9eff',
                cursor: page === totalPages - 1 ? 'default' : 'pointer',
                borderRadius: 3, padding: '3px 10px', fontSize: 11,
              }}
            >Next ›</button>
          </div>
        )}

      </div>
    </aside>
  )
}
