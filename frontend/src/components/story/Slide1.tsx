export default function Slide1() {
  return (
    <div className="slide slide--single-col">
      <div className="slide__step">01</div>
      <h2 className="slide__title">Z-Score Baseline</h2>
      <p className="slide__body">
        Started with purely fundamental signals — annual yield and production data
        normalized as z-scores. Clean signal but slow to react to intra-year moves.
      </p>
      <div className="slide__img-item">
        <p className="slide__caption">Price with original correlations</p>
        <img className="slide__img" src="/wheat/weat_price_with_corr.png" alt="Wheat price with correlations" />
      </div>
      <div className="slide__img-item">
        <p className="slide__caption">Pure z-score signal</p>
        <img className="slide__img" src="/wheat/pure_zscore_signal.png" alt="Pure z-score signal" />
      </div>
    </div>
  )
}
