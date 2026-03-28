"""
Google Earth Engine — 2015–2024 US Wheat Metrics (all sources)
================================================================
Pulls 9+ growing seasons of data for model training.
Checkpoints after each season so crashes don't lose progress.

Sources (wheat-masked where applicable):
  Sentinel-2  →  NDVI, NDWI, EVI     (from mid-2015 onward)
  MODIS LST   →  Land Surface Temp
  NASA SMAP   →  Soil Moisture        (from Apr 2015 onward)
  CHIRPS      →  Rainfall

Regions:
  Kansas (HRW) — winter wheat, Mar–Jul each year
  North Dakota (HRS) — spring wheat, Apr–Sep each year

Prerequisites:
    pip install earthengine-api pandas matplotlib

Usage:
    python 01_gee_us_wheat_all_metrics.py

    If it crashes partway through, just re-run — it skips seasons
    that already have checkpoint files on disk.
"""

import ee
import pandas as pd
import matplotlib.pyplot as plt
import os
import time

# ──────────────────────────────────────────────────────────────
# 1.  INITIALISE
# ──────────────────────────────────────────────────────────────
ee.Authenticate()
ee.Initialize(project="entelechy-491612")   # <-- replace with your GCP project ID

# Output directory for checkpoints
CHECKPOINT_DIR = "wheat_checkpoints"
os.makedirs(CHECKPOINT_DIR, exist_ok=True)


# ──────────────────────────────────────────────────────────────
# 2.  REGIONS + YEAR RANGE
# ──────────────────────────────────────────────────────────────
kansas  = ee.Geometry.Rectangle([-100.5, 37.5, -97.5, 39.5])
ndakota = ee.Geometry.Rectangle([-101.0, 47.5, -97.5, 49.0])

regions = {
    "Kansas_HRW": {
        "geometry": kansas,
        "start_month": 3, "start_day": 1,
        "end_month": 7,   "end_day": 15,
        "wheat_classes": [24, 26],
    },
    "NorthDakota_HRS": {
        "geometry": ndakota,
        "start_month": 4, "start_day": 15,
        "end_month": 9,   "end_day": 15,
        "wheat_classes": [22, 23],
    },
}

YEARS = list(range(2015, 2025))  # 2015 through 2024


# ──────────────────────────────────────────────────────────────
# 3.  CDL WHEAT MASK
# ──────────────────────────────────────────────────────────────
def get_wheat_mask(geometry, wheat_classes, year):
    """
    Load CDL for the given year (or year-1 if not yet available).
    Returns a binary mask: 1 = wheat, 0 = other.
    """
    # Try the target year first, fall back to prior year
    for try_year in [year, year - 1]:
        cdl_col = (
            ee.ImageCollection("USDA/NASS/CDL")
            .filter(ee.Filter.calendarRange(try_year, try_year, "year"))
        )
        if cdl_col.size().getInfo() > 0:
            cdl = cdl_col.first().select("cropland").clip(geometry)
            mask = cdl.eq(wheat_classes[0])
            for cls in wheat_classes[1:]:
                mask = mask.Or(cdl.eq(cls))
            wheat_px = mask.reduceRegion(
                reducer=ee.Reducer.sum(), geometry=geometry,
                scale=30, maxPixels=1e10,
            ).get("cropland").getInfo()
            total_px = mask.reduceRegion(
                reducer=ee.Reducer.count(), geometry=geometry,
                scale=30, maxPixels=1e10,
            ).get("cropland").getInfo()
            pct = (wheat_px / total_px * 100) if total_px > 0 else 0
            print(f"      CDL {try_year}: {wheat_px:,.0f} wheat px ({pct:.1f}%)")
            return mask

    print(f"      ⚠ No CDL found for {year} or {year-1}")
    return None


# ──────────────────────────────────────────────────────────────
# 4.  EXTRACTION FUNCTIONS
# ──────────────────────────────────────────────────────────────

# --- Sentinel-2: NDVI, NDWI, EVI (wheat-masked) ---
def add_vegetation_indices(image):
    ndvi = image.normalizedDifference(["B8", "B4"]).rename("ndvi")
    ndwi = image.normalizedDifference(["B3", "B8"]).rename("ndwi")
    nir  = image.select("B8").multiply(0.0001)
    red  = image.select("B4").multiply(0.0001)
    blue = image.select("B2").multiply(0.0001)
    evi  = nir.subtract(red).multiply(2.5).divide(
        nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1)
    ).rename("evi")
    return image.addBands([ndvi, ndwi, evi])


def get_sentinel2(geometry, start, end, wheat_mask):
    s2 = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(geometry)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .map(add_vegetation_indices)
    )
    count = s2.size().getInfo()
    print(f"      S2: {count} scenes")
    if count == 0:
        return pd.DataFrame(columns=["date", "ndvi", "ndwi", "evi"])

    def extract(image):
        masked = image.select(["ndvi", "ndwi", "evi"])
        if wheat_mask is not None:
            masked = masked.updateMask(wheat_mask)
        means = masked.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=geometry,
            scale=100, maxPixels=1e9,
        )
        return ee.Feature(None, {
            "date": image.date().format("YYYY-MM-dd"),
            "ndvi": means.get("ndvi"),
            "ndwi": means.get("ndwi"),
            "evi":  means.get("evi"),
        })

    data = s2.map(extract).getInfo()["features"]
    rows = [f["properties"] for f in data if f["properties"].get("ndvi") is not None]
    if not rows:
        return pd.DataFrame(columns=["date", "ndvi", "ndwi", "evi"])
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)


# --- MODIS LST (wheat-masked via bestEffort) ---
def get_modis_lst(geometry, start, end, wheat_mask):
    modis = (
        ee.ImageCollection("MODIS/061/MOD11A1")
        .filterBounds(geometry)
        .filterDate(start, end)
        .select("LST_Day_1km")
    )
    count = modis.size().getInfo()
    print(f"      MODIS LST: {count} scenes")
    if count == 0:
        return pd.DataFrame(columns=["date", "lst_c"])

    def extract(image):
        lst_c = image.multiply(0.02).subtract(273.15).rename("lst_c")
        if wheat_mask is not None:
            lst_c = lst_c.updateMask(wheat_mask)
        means = lst_c.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=geometry,
            scale=1000, maxPixels=1e9, bestEffort=True,
        )
        return ee.Feature(None, {
            "date":  image.date().format("YYYY-MM-dd"),
            "lst_c": means.get("lst_c"),
        })

    data = modis.map(extract).getInfo()["features"]
    rows = [f["properties"] for f in data if f["properties"].get("lst_c") is not None]
    if not rows:
        return pd.DataFrame(columns=["date", "lst_c"])
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)


# --- SMAP Soil Moisture (regional, not masked) ---
def get_smap(geometry, start, end):
    smap = (
        ee.ImageCollection("NASA/SMAP/SPL4SMGP/008")
        .filterBounds(geometry)
        .filterDate(start, end)
    )
    count = smap.size().getInfo()
    print(f"      SMAP: {count} scenes")
    if count == 0:
        return pd.DataFrame(columns=["date", "soil_moisture"])

    # Auto-detect band
    band_names = smap.first().bandNames().getInfo()
    sm_band = None
    for c in ["sm_rootzone", "sm_rootzone_pctl", "sm_profile", "sm_surface"]:
        if c in band_names:
            sm_band = c
            break
    if sm_band is None:
        sm_bands = [b for b in band_names if "sm" in b.lower()]
        sm_band = sm_bands[0] if sm_bands else None
    if sm_band is None:
        print(f"      ⚠ No SM band in {band_names[:5]}")
        return pd.DataFrame(columns=["date", "soil_moisture"])

    print(f"      Using band: {sm_band}")
    smap = smap.select(sm_band)

    # Weekly composites instead of daily (much faster for multi-year pulls)
    weeks = ee.List.sequence(
        ee.Date(start).millis(),
        ee.Date(end).millis(),
        604800000  # 7 days in ms
    )

    def weekly_mean(week_ms):
        d = ee.Date(week_ms)
        weekly = smap.filterDate(d, d.advance(7, "day"))
        mean_img = weekly.mean()
        means = mean_img.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=geometry,
            scale=9000, maxPixels=1e9,
        )
        val = ee.Algorithms.If(weekly.size().gt(0), means.get(sm_band), None)
        return ee.Feature(None, {
            "date": d.format("YYYY-MM-dd"),
            "soil_moisture": val,
        })

    data = ee.FeatureCollection(weeks.map(weekly_mean)).getInfo()["features"]
    rows = [f["properties"] for f in data if f["properties"].get("soil_moisture") is not None]
    if not rows:
        return pd.DataFrame(columns=["date", "soil_moisture"])
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)


# --- CHIRPS Rainfall (regional) ---
def get_chirps(geometry, start, end):
    chirps = (
        ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
        .filterBounds(geometry)
        .filterDate(start, end)
        .select("precipitation")
    )
    count = chirps.size().getInfo()
    print(f"      CHIRPS: {count} scenes")
    if count == 0:
        return pd.DataFrame(columns=["date", "rainfall_mm"])

    def extract(image):
        means = image.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=geometry,
            scale=5000, maxPixels=1e9,
        )
        return ee.Feature(None, {
            "date":        image.date().format("YYYY-MM-dd"),
            "rainfall_mm": means.get("precipitation"),
        })

    data = chirps.map(extract).getInfo()["features"]
    rows = [f["properties"] for f in data if f["properties"].get("rainfall_mm") is not None]
    if not rows:
        return pd.DataFrame(columns=["date", "rainfall_mm"])
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)


# ──────────────────────────────────────────────────────────────
# 5.  MAIN LOOP — per region, per year, with checkpoints
# ──────────────────────────────────────────────────────────────
print("=" * 65)
print("  US Wheat Metrics — 2015–2024 — All Sources")
print("  Checkpointing after each season")
print("=" * 65)

total_seasons = len(regions) * len(YEARS)
completed = 0
skipped = 0

for label, cfg in regions.items():
    for year in YEARS:
        # Build date strings for this season
        start = f"{year}-{cfg['start_month']:02d}-{cfg['start_day']:02d}"
        end   = f"{year}-{cfg['end_month']:02d}-{cfg['end_day']:02d}"
        season_tag = f"{label}_{year}"

        # Check if checkpoint already exists
        ckpt_path = os.path.join(CHECKPOINT_DIR, f"{season_tag}.csv")
        if os.path.exists(ckpt_path):
            completed += 1
            skipped += 1
            print(f"\n  [{completed}/{total_seasons}] {season_tag} — SKIPPED (checkpoint exists)")
            continue

        completed += 1
        print(f"\n  [{completed}/{total_seasons}] {season_tag}")
        print(f"    Period: {start} → {end}")
        t0 = time.time()

        g = cfg["geometry"]

        # CDL mask (use same year if available, else year-1)
        print(f"    Building wheat mask...")
        wheat_mask = get_wheat_mask(g, cfg["wheat_classes"], year)

        # Pull all four sources
        try:
            df_s2   = get_sentinel2(g, start, end, wheat_mask)
            df_lst  = get_modis_lst(g, start, end, wheat_mask)
            df_smap = get_smap(g, start, end)
            df_rain = get_chirps(g, start, end)
        except Exception as ex:
            print(f"    ⚠ ERROR: {ex}")
            print(f"    Skipping {season_tag} — re-run later to retry")
            continue

        # Tag with metadata
        for df, src in [(df_s2, "sentinel2"), (df_lst, "modis"),
                        (df_smap, "smap"), (df_rain, "chirps")]:
            df["region"] = label
            df["year"] = year
            df["source"] = src

        # Merge into one wide row per date
        def safe_set_index(df, cols):
            if df.empty:
                return pd.DataFrame()
            return df.set_index("date")[cols]

        s2_idx   = safe_set_index(df_s2,   ["ndvi", "ndwi", "evi"])
        lst_idx  = safe_set_index(df_lst,  ["lst_c"])
        smap_idx = safe_set_index(df_smap, ["soil_moisture"])
        rain_idx = safe_set_index(df_rain, ["rainfall_mm"])

        # Join all on date
        frames = [f for f in [s2_idx, lst_idx, smap_idx, rain_idx] if not f.empty]
        if not frames:
            print(f"    ⚠ No data for {season_tag}")
            continue

        merged = frames[0]
        for f in frames[1:]:
            merged = merged.join(f, how="outer")

        # Resample to daily and forward-fill gaps (max 5 days)
        merged = merged.resample("D").mean().ffill(limit=5)
        merged["region"] = label
        merged["year"] = year

        # Save checkpoint
        merged.to_csv(ckpt_path)
        elapsed = time.time() - t0
        print(f"    ✓ Saved {ckpt_path}  ({len(merged)} rows, {elapsed:.0f}s)")


# ──────────────────────────────────────────────────────────────
# 6.  COMBINE ALL CHECKPOINTS INTO FINAL CSVs
# ──────────────────────────────────────────────────────────────
print("\n" + "=" * 65)
print("  Combining all checkpoints into final CSVs...")
print("=" * 65)

all_frames = []
for f in sorted(os.listdir(CHECKPOINT_DIR)):
    if f.endswith(".csv"):
        df = pd.read_csv(os.path.join(CHECKPOINT_DIR, f))
        # The date might be the index (unnamed first col) or a named column
        if "date" not in df.columns:
            # First column is the date index — rename it
            df = df.rename(columns={df.columns[0]: "date"})
        df["date"] = pd.to_datetime(df["date"])
        all_frames.append(df)
        print(f"  Loaded {f}: {len(df)} rows")

if not all_frames:
    print("  ⚠ No checkpoint files found!")
else:
    full = pd.concat(all_frames, ignore_index=True)
    full = full.sort_values(["region", "date"]).reset_index(drop=True)

    # Daily CSV
    full.to_csv("wheat_all_metrics_daily_2015_2024.csv", index=False)
    print(f"\n  Daily:  wheat_all_metrics_daily_2015_2024.csv  ({len(full)} rows)")

    # Weekly CSV (better for model training / lag analysis)
    weekly = full.copy()
    weekly = weekly.set_index("date")
    weekly_agg = weekly.groupby(["region", "year"]).resample("W").agg({
        "ndvi": "mean",
        "ndwi": "mean",
        "evi": "mean",
        "lst_c": "mean",
        "soil_moisture": "mean",
        "rainfall_mm": "sum",
    }).reset_index()
    weekly_agg.to_csv("wheat_all_metrics_weekly_2015_2024.csv", index=False)
    print(f"  Weekly: wheat_all_metrics_weekly_2015_2024.csv  ({len(weekly_agg)} rows)")

    # Summary stats
    print(f"\n  Date range: {full['date'].min()} → {full['date'].max()}")
    print(f"  Regions: {full['region'].unique().tolist()}")
    print(f"  Years: {sorted(full['year'].unique().tolist())}")
    print(f"\n  Column null counts:")
    for col in ["ndvi", "ndwi", "evi", "lst_c", "soil_moisture", "rainfall_mm"]:
        if col in full.columns:
            n = full[col].notna().sum()
            pct = n / len(full) * 100
            print(f"    {col:20s}: {n:>8,} values ({pct:.1f}% coverage)")

print("\n" + "=" * 65)
print("  DONE.")
print("  Your friend can merge WEAT prices on the 'date' column.")
print("  Weekly CSV is recommended for model training.")
print("=" * 65)