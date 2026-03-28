"""
Export satellite images for the 3 largest wheat fields per region
=================================================================
For each field:
  - Finds the 3 largest contiguous wheat areas from CDL
  - Pulls the 4 most recent cloud-free Sentinel-2 scenes
  - Generates side-by-side RGB + NDVI false-color thumbnails
  - Saves as PNGs

Output: 3 fields × 4 dates × 2 regions = 24 images total

Prerequisites:
    pip install earthengine-api requests Pillow

Usage:
    python 03_export_field_images.py
"""

import ee
import requests
import os
import time
from io import BytesIO

# ──────────────────────────────────────────────────────────────
# 1.  INITIALISE
# ──────────────────────────────────────────────────────────────
ee.Authenticate()
ee.Initialize(project="entelechy-491612")   # <-- replace with your GCP project ID

OUTPUT_DIR = "wheat_field_images"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Image dimensions for thumbnails
THUMB_SIZE = 512  # pixels per side


# ──────────────────────────────────────────────────────────────
# 2.  REGIONS
# ──────────────────────────────────────────────────────────────
regions = {
    "Kansas_HRW": {
        "geometry": ee.Geometry.Rectangle([-100.5, 37.5, -97.5, 39.5]),
        "wheat_classes": [24, 26],
        "season_start": "2024-03-01",
        "season_end": "2024-07-15",
    },
    "NorthDakota_HRS": {
        "geometry": ee.Geometry.Rectangle([-101.0, 47.5, -97.5, 49.0]),
        "wheat_classes": [22, 23],
        "season_start": "2024-04-15",
        "season_end": "2024-09-15",
    },
}

CDL_YEAR = 2023
N_FIELDS = 3
N_IMAGES = 4


# ──────────────────────────────────────────────────────────────
# 3.  FIND THE 3 LARGEST WHEAT CLUSTERS
# ──────────────────────────────────────────────────────────────
def find_largest_wheat_fields(geometry, wheat_classes, n=3):
    """
    Vectorize wheat pixels at coarser resolution, find the n largest
    contiguous clusters by pixel count.
    Returns list of ee.Geometry objects.
    """
    print(f"    Finding {n} largest wheat fields...")

    cdl = (
        ee.ImageCollection("USDA/NASS/CDL")
        .filter(ee.Filter.calendarRange(CDL_YEAR, CDL_YEAR, "year"))
        .first()
        .select("cropland")
        .clip(geometry)
    )

    # Binary wheat mask
    mask = cdl.eq(wheat_classes[0])
    for cls in wheat_classes[1:]:
        mask = mask.Or(cdl.eq(cls))

    # Reduce to ~120m to make vectorization feasible
    mask_coarse = mask.reduceResolution(
        reducer=ee.Reducer.mean(),
        maxPixels=16,
    ).reproject(
        crs=cdl.projection().atScale(120)
    ).gt(0.3).selfMask()

    # Label connected components
    connected = mask_coarse.connectedComponents(
        connectedness=ee.Kernel.square(1),
        maxSize=1024,
    )

    # Vectorize — limit to manageable count
    vectors = connected.select("labels").reduceToVectors(
        geometry=geometry,
        scale=120,
        geometryType="polygon",
        eightConnected=True,
        maxPixels=1e9,
        reducer=ee.Reducer.countEvery(),
        bestEffort=True,
    )

    # Sort by size (count), take top n
    sorted_vectors = vectors.sort("count", False).limit(n)
    features = sorted_vectors.getInfo()["features"]

    results = []
    for i, feat in enumerate(features):
        geom = ee.Geometry(feat["geometry"])
        pixel_count = feat["properties"].get("count", 0)
        # Get centroid for labeling
        centroid = geom.centroid(1).coordinates().getInfo()
        area_km2 = geom.area(1).getInfo() / 1e6
        print(f"      Field {i+1}: ~{area_km2:.1f} km² at ({centroid[1]:.3f}, {centroid[0]:.3f})")
        results.append({
            "geometry": geom,
            "centroid": centroid,
            "area_km2": area_km2,
            "rank": i + 1,
        })

    return results


# ──────────────────────────────────────────────────────────────
# 4.  GET THUMBNAIL URLs FOR RGB + NDVI
# ──────────────────────────────────────────────────────────────
def get_field_images(field_geom, season_start, season_end, n_images=4):
    """
    Find the n most recent cloud-free Sentinel-2 scenes over a field,
    return thumbnail URLs for both RGB and NDVI visualizations.
    """
    # Buffer the geometry slightly for context
    buffered = field_geom.buffer(500)  # 500m buffer
    bounds = buffered.bounds()

    s2 = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(field_geom)
        .filterDate(season_start, season_end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 15))
        .sort("system:time_start", False)  # most recent first
        .limit(n_images)
    )

    count = s2.size().getInfo()
    if count == 0:
        print(f"        ⚠ No cloud-free scenes found")
        return []

    images = s2.toList(n_images)
    results = []

    for i in range(min(count, n_images)):
        image = ee.Image(images.get(i))
        date = image.date().format("YYYY-MM-dd").getInfo()

        # RGB thumbnail (true color)
        rgb_params = {
            "bands": ["B4", "B3", "B2"],
            "min": 0,
            "max": 3000,
            "dimensions": THUMB_SIZE,
            "region": bounds,
            "format": "png",
        }
        rgb_url = image.getThumbURL(rgb_params)

        # NDVI false color thumbnail
        ndvi = image.normalizedDifference(["B8", "B4"]).rename("NDVI")
        ndvi_params = {
            "bands": ["NDVI"],
            "min": 0,
            "max": 0.9,
            "palette": ["8B4513", "D2691E", "DAA520", "ADFF2F", "228B22", "006400"],
            "dimensions": THUMB_SIZE,
            "region": bounds,
            "format": "png",
        }
        ndvi_url = ndvi.getThumbURL(ndvi_params)

        results.append({
            "date": date,
            "rgb_url": rgb_url,
            "ndvi_url": ndvi_url,
        })

    return results


# ──────────────────────────────────────────────────────────────
# 5.  DOWNLOAD AND STITCH SIDE BY SIDE
# ──────────────────────────────────────────────────────────────
def download_and_stitch(rgb_url, ndvi_url, out_path, date, field_rank, region):
    """
    Download RGB and NDVI thumbnails, stitch side by side with labels.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("    ⚠ Pillow not installed — saving URLs only")
        return False

    # Download both images
    rgb_resp = requests.get(rgb_url, timeout=60)
    ndvi_resp = requests.get(ndvi_url, timeout=60)

    if rgb_resp.status_code != 200 or ndvi_resp.status_code != 200:
        print(f"      ⚠ Download failed (RGB: {rgb_resp.status_code}, NDVI: {ndvi_resp.status_code})")
        return False

    rgb_img = Image.open(BytesIO(rgb_resp.content)).convert("RGB")
    ndvi_img = Image.open(BytesIO(ndvi_resp.content)).convert("RGB")

    # Resize to same height
    h = max(rgb_img.height, ndvi_img.height)
    if rgb_img.height != h:
        rgb_img = rgb_img.resize((int(rgb_img.width * h / rgb_img.height), h))
    if ndvi_img.height != h:
        ndvi_img = ndvi_img.resize((int(ndvi_img.width * h / ndvi_img.height), h))

    # Create side-by-side canvas with labels
    gap = 4
    label_h = 32
    total_w = rgb_img.width + gap + ndvi_img.width
    total_h = h + label_h

    canvas = Image.new("RGB", (total_w, total_h), (15, 20, 30))
    canvas.paste(rgb_img, (0, label_h))
    canvas.paste(ndvi_img, (rgb_img.width + gap, label_h))

    # Add labels
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except (OSError, IOError):
        font = ImageFont.load_default()

    title = f"{region} — Field #{field_rank} — {date}"
    draw.text((8, 4), title, fill=(200, 220, 240), font=font)

    # Sub-labels
    small_font = font
    draw.text((8, label_h + 4), "RGB", fill=(180, 200, 220), font=small_font)
    draw.text((rgb_img.width + gap + 8, label_h + 4), "NDVI", fill=(74, 222, 128), font=small_font)

    canvas.save(out_path, "PNG")
    return True


# ──────────────────────────────────────────────────────────────
# 6.  ALSO SAVE A URL MANIFEST (in case Pillow isn't available)
# ──────────────────────────────────────────────────────────────
def save_url_manifest(all_results, out_path):
    """Save all thumbnail URLs as a JSON file for the frontend."""
    import json
    with open(out_path, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"  ✓ URL manifest: {out_path}")


# ──────────────────────────────────────────────────────────────
# 7.  MAIN
# ──────────────────────────────────────────────────────────────
print("=" * 60)
print("  Exporting satellite images for largest wheat fields")
print(f"  {N_FIELDS} fields × {N_IMAGES} dates × {len(regions)} regions")
print("=" * 60)

all_manifest = []

for label, cfg in regions.items():
    print(f"\n{'─' * 50}")
    print(f"  {label}")
    print(f"{'─' * 50}")

    # Find the 3 largest wheat fields
    fields = find_largest_wheat_fields(
        cfg["geometry"], cfg["wheat_classes"], n=N_FIELDS
    )

    for field in fields:
        rank = field["rank"]
        lng, lat = field["centroid"]
        print(f"\n    Field #{rank} ({field['area_km2']:.1f} km²)")

        # Get thumbnail URLs for last 4 scenes
        images = get_field_images(
            field["geometry"],
            cfg["season_start"],
            cfg["season_end"],
            n_images=N_IMAGES,
        )

        if not images:
            continue

        for img in images:
            date = img["date"]
            fname = f"{label}_field{rank}_{date}.png"
            out_path = os.path.join(OUTPUT_DIR, fname)

            print(f"      {date}...", end=" ")

            success = download_and_stitch(
                img["rgb_url"], img["ndvi_url"],
                out_path, date, rank, label,
            )

            if success:
                print(f"✓ {fname}")
            else:
                print(f"(URLs saved to manifest)")

            # Add to manifest
            all_manifest.append({
                "region": label,
                "field_rank": rank,
                "area_km2": round(field["area_km2"], 1),
                "lat": round(lat, 4),
                "lng": round(lng, 4),
                "date": date,
                "rgb_url": img["rgb_url"],
                "ndvi_url": img["ndvi_url"],
                "local_file": fname,
            })

# Save URL manifest
save_url_manifest(all_manifest, os.path.join(OUTPUT_DIR, "image_manifest.json"))

print("\n" + "=" * 60)
print("  DONE.")
print(f"  Images: {OUTPUT_DIR}/")
print(f"  Manifest: {OUTPUT_DIR}/image_manifest.json")
print(f"  Total images: {len(all_manifest)}")
print("=" * 60)