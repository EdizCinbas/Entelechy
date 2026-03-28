import { useState } from 'react'
import Slide1 from './Slide1'
import Slide2 from './Slide2'
import Slide3 from './Slide3'
import Slide4 from './Slide4'

const SLIDES = [Slide1, Slide2, Slide3, Slide4]
const TITLES = ['Z-Score Baseline', 'Satellite Signal', 'Lag Analysis', 'Final Strategy']

interface StoryPanelProps {
  onClose: () => void
}

export default function StoryPanel({ onClose }: StoryPanelProps) {
  const [index, setIndex] = useState(0)
  const Slide = SLIDES[index]

  return (
    <div className="story-panel">
      <div className="story-panel__header">
        <span className="story-panel__title">Wheat Strategy</span>
        <button className="story-panel__close" onClick={onClose}>✕</button>
      </div>

      <div className="story-panel__dots">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            className={`story-dot${i === index ? ' story-dot--active' : ''}`}
            onClick={() => setIndex(i)}
            title={TITLES[i]}
          />
        ))}
      </div>

      <div className="story-panel__body">
        <Slide />
      </div>

      <div className="story-panel__nav">
        <button
          className="story-nav-btn"
          onClick={() => setIndex(i => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          ← Prev
        </button>
        <span className="story-nav-counter">{index + 1} / {SLIDES.length}</span>
        <button
          className="story-nav-btn"
          onClick={() => setIndex(i => Math.min(SLIDES.length - 1, i + 1))}
          disabled={index === SLIDES.length - 1}
        >
          Next →
        </button>
      </div>
    </div>
  )
}
