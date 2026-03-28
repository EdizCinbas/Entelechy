import { useState } from 'react'
import GraphPanel from './components/GraphPanel'
import GlobePanel from './components/GlobePanel'
import NewsPanel from './components/NewsPanel'
import './App.css'

export default function App() {
  const [activeQuery, setActiveQuery]       = useState('almonds')
  const [leftCollapsed,  setLeftCollapsed]  = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  return (
    <div className="dashboard">
      <GraphPanel
        activeQuery={activeQuery}
        collapsed={leftCollapsed}
        onToggle={() => setLeftCollapsed(v => !v)}
      />
      <GlobePanel />
      <NewsPanel
        activeQuery={activeQuery}
        onQueryChange={setActiveQuery}
        collapsed={rightCollapsed}
        onToggle={() => setRightCollapsed(v => !v)}
      />
    </div>
  )
}
