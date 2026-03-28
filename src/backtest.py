"""
Backtesting engine and performance metrics.
"""

import datetime
import numpy as np
from dataclasses import dataclass, field


@dataclass
class Trade:
    region: str
    entry_date: datetime.date
    exit_date: datetime.date
    direction: str          # 'long' | 'short'
    signal_strength: float
    entry_price: float
    exit_price: float
    pnl: float = 0.0
    pnl_pct: float = 0.0


@dataclass
class BacktestResult:
    trades: list[Trade] = field(default_factory=list)
    total_return: float = 0.0
    sharpe_ratio: float = 0.0
    max_drawdown: float = 0.0
    win_rate: float = 0.0
    num_trades: int = 0


# --- Engine ---

def run_backtest(
    start_year: int,
    end_year: int,
    regions: list[str],
    ticker: str = "ZW=F",
    capital: float = 100_000.0,
    signal_threshold: float = 0.2,
    slippage_bps: float = 5.0,
    max_risk_per_trade: float = 0.02,
) -> BacktestResult:
    """
    Loop over seasons in [start_year, end_year]:
      1. Load cached NDVI → extract features → predict yield → build signal
      2. Skip if |signal| < threshold
      3. Simulate entry/exit with slippage, log Trade
    No lookahead: only use data available at signal date.
    """
    pass


def position_size(signal_strength: float, capital: float, volatility: float, max_risk: float = 0.02) -> float:
    """Volatility-adjusted size = signal_strength * capital * max_risk / volatility."""
    pass


# --- Metrics ---

def sharpe_ratio(returns: "pd.Series", risk_free_rate: float = 0.04) -> float:
    """Annualized Sharpe = (mean_return - rfr) / std * sqrt(252)."""
    pass


def max_drawdown(equity_curve: "pd.Series") -> float:
    """Peak-to-trough drawdown as a fraction (e.g. -0.15 = -15%)."""
    pass


def win_rate(trades: list[Trade]) -> float:
    """Fraction of trades with pnl > 0."""
    pass


def print_summary(result: BacktestResult) -> None:
    """Print formatted backtest summary."""
    pass
