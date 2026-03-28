"""
Sentinel Hub imagery fetching and NDVI computation.
"""

import datetime
import numpy as np
from sentinelhub import SHConfig


def get_sh_config(instance_id: str = "") -> SHConfig:
    """Return a configured SHConfig. Reads SH_INSTANCE_ID from env if not provided."""
    pass


def fetch_ndvi_timeseries(
    region_bbox: tuple[float, float, float, float],  # (lon_min, lat_min, lon_max, lat_max)
    start_date: datetime.date,
    end_date: datetime.date,
    config: SHConfig | None = None,
    cloud_cover_threshold: float = 20.0,
    resolution: int = 10,
) -> "pd.DataFrame":
    """
    Fetch Sentinel-2 imagery for a region and return a spatial-mean NDVI time-series.

    Uses the Process API evalscript to compute NDVI = (B08 - B04) / (B08 + B04)
    on the fly, returning one mean value per cloud-free acquisition.

    Returns DataFrame with columns: ['date', 'ndvi_mean', 'ndvi_std']
    """
    pass


def compute_ndvi_anomaly(
    current_ndvi: float,
    historical_ndvi: "pd.Series",
) -> float:
    """Z-score of current NDVI vs historical distribution for the same day-of-year."""
    pass
