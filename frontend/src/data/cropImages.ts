export interface CropImage {
  crop: string
  src: string
}

/**
 * Builds a NASA GIBS WMS URL for a lat/lng bounding box.
 * Returns a JPEG image served directly — no API key required.
 * MODIS Terra True Color is updated daily at 250m resolution.
 * Docs: https://nasa-gibs.github.io/gibs-api-docs/access-basics/#wms
 */
function gibs(west: number, south: number, east: number, north: number, date: string): string {
  return (
    'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi' +
    '?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
    '&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor' +
    `&CRS=CRS:84&BBOX=${west},${south},${east},${north}` +
    '&WIDTH=256&HEIGHT=256&FORMAT=image/jpeg' +
    `&TIME=${date}`
  )
}

/**
 * Satellite crop images per region ID.
 * Each entry's `src` is a live GIBS WMS URL — images load directly in <img>.
 * To update imagery date, change the date string (YYYY-MM-DD).
 * Dates are chosen for peak crop visibility in each region.
 */
const CROP_IMAGES: Record<string, CropImage[]> = {
  california: [
    // Central Valley almond orchards near Fresno (peak leaf-out, July)
    { crop: 'Almonds',    src: gibs(-121.0, 36.5, -119.5, 37.5, '2024-07-15') },
    // San Joaquin Valley tomatoes & wheat (mid-summer)
    { crop: 'Tomatoes',   src: gibs(-121.5, 37.5, -120.0, 38.5, '2024-07-15') },
    // Sacramento Valley rice (flooded fields visible, July)
    { crop: 'Rice',       src: gibs(-122.0, 38.5, -120.5, 39.5, '2024-07-15') },
    // Coachella Valley grapes & citrus (southern end)
    { crop: 'Grapes',     src: gibs(-116.5, 33.5, -115.5, 34.0, '2024-07-15') },
  ],
  kansas: [
    // Western Kansas wheat belt near Dodge City (just before harvest, June)
    { crop: 'Winter Wheat', src: gibs(-101.0, 37.5, -99.5, 38.5, '2024-06-15') },
    // Central Kansas sorghum (summer growth, August)
    { crop: 'Sorghum',      src: gibs(-98.5, 37.5, -97.0, 38.5, '2024-08-01') },
    // Eastern Kansas corn (peak canopy, July)
    { crop: 'Corn',         src: gibs(-96.5, 38.0, -95.0, 39.0, '2024-07-15') },
  ],
  ukraine: [
    // Kherson Oblast wheat (southern Ukraine, June harvest)
    { crop: 'Wheat',      src: gibs(32.0, 46.5, 34.5, 48.0, '2024-06-15') },
    // Dnipropetrovsk sunflowers (mid-summer, July)
    { crop: 'Sunflowers', src: gibs(34.0, 47.5, 36.0, 49.0, '2024-07-15') },
    // Poltava corn (central Ukraine, August)
    { crop: 'Corn',       src: gibs(33.0, 49.0, 35.0, 50.5, '2024-08-01') },
  ],
  india: [
    // Punjab wheat (pre-harvest, March — fields still green)
    { crop: 'Wheat',      src: gibs(74.0, 30.0, 76.0, 32.0, '2024-03-01') },
    // Andhra Pradesh rice (second crop, October)
    { crop: 'Rice',       src: gibs(79.5, 15.5, 81.5, 17.0, '2024-10-01') },
    // Maharashtra sugar cane (winter, December)
    { crop: 'Sugar Cane', src: gibs(74.5, 17.0, 76.5, 18.5, '2024-12-01') },
  ],
  australia: [
    // WA wheat belt near Merredin (spring growth, October)
    { crop: 'Wheat',  src: gibs(117.5, -32.0, 119.5, -30.5, '2024-10-15') },
    // NSW cotton near Narrabri (summer, January)
    { crop: 'Cotton', src: gibs(149.5, -30.5, 151.0, -29.5, '2024-01-15') },
    // SA barley (Eyre Peninsula, October)
    { crop: 'Barley', src: gibs(135.0, -33.5, 136.5, -32.0, '2024-10-15') },
  ],
}

export default CROP_IMAGES
