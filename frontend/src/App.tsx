import GraphPanel from './components/GraphPanel'
import GlobePanel from './components/GlobePanel'
import NewsPanel from './components/NewsPanel'
import './App.css'

export default function App() {
  return (
    <div className="dashboard">
      <GraphPanel />
      <GlobePanel />
      <NewsPanel />
    </div>
  )
}
