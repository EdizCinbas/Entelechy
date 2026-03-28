"""
Yield estimation and investment signal generation.
"""

import datetime
import numpy as np


# --- Yield features & prediction ---

def extract_yield_features(ndvi_ts: "pd.DataFrame") -> dict:
    """
    Derive scalar features from an NDVI time-series.
    Returns: {'gsi', 'peak_ndvi', 'peak_doy', 'ndvi_at_heading', 'anomaly_zscore'}
    """
    pass


def train_yield_model(features_df: "pd.DataFrame", yields_df: "pd.DataFrame") -> object:
    """Train a Random Forest regressor: yield ~ ndvi features. Returns fitted model."""
    pass


def predict_yield(model: object, features: dict) -> float:
    """Return predicted yield in tonnes/hectare."""
    pass


# --- Signal construction ---

def build_signal(
    predicted_yield: float,
    hist_mean: float,
    hist_std: float,
) -> float:
    """
    Normalize yield forecast into a signal in (-1, +1).
    signal = tanh((predicted - hist_mean) / hist_std)
    Positive → above-average yield (bearish wheat price), negative → bearish.
    """
    pass


def combine_region_signals(region_signals: dict[str, float], weights: dict[str, float]) -> float:
    """Weighted average of per-region signals. Weights should sum to 1."""
    pass


def signal_timing(signal: float, harvest_date: datetime.date, lead_weeks: int = 8) -> dict:
    """
    Return {'entry_date', 'exit_date', 'direction', 'strength'}.
    Entry is lead_weeks before harvest; exit at harvest date.
    """
    pass
