export interface CropImage {
  crop: string
  src: string
}

/**
 * NASA GIBS WMS — no API key required, MODIS True Color, 250 m resolution.
 * Omitting TIME returns the most recent available image (1–3 day latency).
 *
 * Resolution note: MODIS is 250 m/px. For production field-level detail,
 * switch to Sentinel Hub (10 m Sentinel-2, free tier, needs OAuth2 + backend).
 *
 * Padding is applied relative to each field's bbox so smaller fields are
 * zoomed out enough to avoid blank tile edges.
 */
// MODIS has ~3 day processing latency — use 4 days ago to guarantee data exists
function recentDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 4)
  return d.toISOString().slice(0, 10)
}

const DATE = recentDate()

function gibs(west: number, south: number, east: number, north: number): string {
  // 40% padding — keeps even the smallest fields away from tile edges
  const dLon = (east - west)   * 0.4
  const dLat = (north - south) * 0.4
  const w = (west  - dLon).toFixed(5)
  const s = (south - dLat).toFixed(5)
  const e = (east  + dLon).toFixed(5)
  const n = (north + dLat).toFixed(5)
  return (
    'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi' +
    '?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
    '&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor' +
    `&CRS=CRS:84&BBOX=${w},${s},${e},${n}` +
    `&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg&TIME=${DATE}`
  )
}

// Coords from almond_fields_2024.csv / wheat_fields_2024.csv (now deleted)
const CROP_IMAGES: Record<string, CropImage[]> = {
  california: [
    // CA_Almond_01 — 25,376 ha near Modesto
    { crop: 'Almonds · 25k ha', src: gibs(-120.9295, 37.5000, -120.4998, 37.6438) },
    // CA_Almond_02 — 17,580 ha
    { crop: 'Almonds · 17k ha', src: gibs(-120.4657, 37.0001, -120.1410, 37.1570) },
    // CA_Almond_03 — 15,716 ha near Fresno
    { crop: 'Almonds · 16k ha', src: gibs(-119.5001, 35.5000, -119.2959, 35.6888) },
    // CA_Almond_04 — 14,097 ha
    { crop: 'Almonds · 14k ha', src: gibs(-119.3389, 35.5001, -119.2081, 35.7613) },
  ],
  kansas: [
    // Kansas_HRW_000001 — 6,732 ha
    { crop: 'HRW Wheat · 6.7k ha', src: gibs(-98.5245, 37.5076, -98.3368, 37.5944) },
    // Kansas_HRW_000002 — 5,142 ha
    { crop: 'HRW Wheat · 5.1k ha', src: gibs(-97.8443, 37.5028, -97.6982, 37.5884) },
    // Kansas_HRW_000003 — 4,323 ha
    { crop: 'HRW Wheat · 4.3k ha', src: gibs(-98.2270, 37.9485, -98.0690, 38.0238) },
    // Kansas_HRW_000004 — 4,247 ha
    { crop: 'HRW Wheat · 4.2k ha', src: gibs(-98.9322, 37.5093, -98.7934, 37.6159) },
  ],
  northdakota: [
    // NorthDakota_HRS_000001 — 4,292 ha
    { crop: 'HRS Wheat · 4.3k ha', src: gibs(-100.8405, 48.6762, -100.7096, 48.8003) },
    // NorthDakota_HRS_000002 — 4,217 ha
    { crop: 'HRS Wheat · 4.2k ha', src: gibs(-99.1110, 48.6589, -98.9344, 48.7691) },
    // NorthDakota_HRS_000003 — 3,849 ha
    { crop: 'HRS Wheat · 3.8k ha', src: gibs(-98.9706, 48.6522, -98.8399, 48.7505) },
    // NorthDakota_HRS_000004 — 3,494 ha
    { crop: 'HRS Wheat · 3.5k ha', src: gibs(-100.9292, 48.9372, -100.7219, 48.9998) },
  ],
}

export default CROP_IMAGES
