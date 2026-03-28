export default function Slide3() {
  return (
    <div className="slide slide--single-col">
      <div className="slide__step">03</div>
      <h2 className="slide__title">Lag Analysis</h2>
      <p className="slide__body">
        Explored time-lagged correlations between satellite readings and price moves
        to find the optimal lead time for signal entry.
      </p>
      <p className="slide__body">
        Heatmap shows correlation strength across lags; scatters confirm
        the relationship holds at the best lag windows.
      </p>
      <div className="slide__img-item">
        <p className="slide__caption">Satellite lag heatmap</p>
        <img className="slide__img" src="/wheat/satellite_lag_heatmap.png" alt="Satellite lag heatmap" />
      </div>
    </div>
  )
}
