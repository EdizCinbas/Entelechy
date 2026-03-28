import { useState } from 'react'
import GraphPanel from './components/GraphPanel'
import GlobePanel from './components/GlobePanel'
import NewsPanel from './components/NewsPanel'
import './App.css'

export default function App() {
  const [activeQuery, setActiveQuery] = useState('almonds')

  return (
    <div className="dashboard">
      <GraphPanel activeQuery={activeQuery} />
      <GlobePanel />
      <NewsPanel activeQuery={activeQuery} onQueryChange={setActiveQuery} />
    </div>
  )
}
