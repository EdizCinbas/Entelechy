"""
Usage:
  python main.py --mode cache     # pre-fetch and cache historical NDVI
  python main.py --mode backtest  # run full backtest
  python main.py --mode signal    # generate live signal for current season
"""

import argparse
from src.backtest import run_backtest, print_summary
from src.imagery import fetch_ndvi_timeseries
from src.signal import build_signal, combine_region_signals, signal_timing

REGIONS = ["kansas", "ukraine", "india", "australia"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["cache", "backtest", "signal"], required=True)
    args = parser.parse_args()

    if args.mode == "cache":
        # TODO: loop regions/years, call fetch_ndvi_timeseries, cache to parquet
        pass

    elif args.mode == "backtest":
        result = run_backtest(start_year=2015, end_year=2024, regions=REGIONS)
        print_summary(result)

    elif args.mode == "signal":
        # TODO: fetch current-season NDVI → predict → combine → print signal
        pass


if __name__ == "__main__":
    main()
