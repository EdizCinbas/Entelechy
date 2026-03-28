export default function Slide2() {
  return (
    <div className="slide slide--single-col">
      <div className="slide__step">02</div>
      <h2 className="slide__title">Satellite Signal</h2>
      <p className="slide__body">
        Traded purely on satellite (NDVI) data at weekly resolution.
        High frequency but very noisy.
      </p>
      <p className="slide__body">
        Applied a Kalman filter to smooth the ensemble — much cleaner entries
        and reduced whipsaw trades.
      </p>
      <div className="slide__img-item">
        <p className="slide__caption">Pure satellite weekly</p>
        <img className="slide__img" src="/wheat/pure_satellite_weekly.png" alt="Pure satellite weekly" />
      </div>
      <div className="slide__img-item">
        <p className="slide__caption">After Kalman filter</p>
        <img className="slide__img" src="/wheat/kalman_ensemble.png" alt="Kalman ensemble" />
      </div>
    </div>
  )
}
