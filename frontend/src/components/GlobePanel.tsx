export default function GlobePanel() {
  return (
    <main className="panel panel--globe">
      <div className="globe-placeholder">
        <div className="globe-ring globe-ring--outer" />
        <div className="globe-ring globe-ring--mid" />
        <div className="globe-ring globe-ring--inner" />
        <div className="globe-core" />
      </div>
    </main>
  )
}
