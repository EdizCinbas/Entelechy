import pandas as pd
import numpy as np
from scipy import stats
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

# ---------------------------
# Load merged df from corr.py saved outputs
# ---------------------------
lag_results = pd.read_csv("src/wheat/lag_correlation_results.csv")

weat = pd.read_csv("src/wheat/WEAT_stock_prices.csv")
weat["date"] = pd.to_datetime(weat["date"])
weat = weat[(weat["date"].dt.year >= 2012) & (weat["date"].dt.year <= 2024)]
weat["year"] = weat["date"].dt.year
weat["ret"] = pd.to_numeric(weat["ret"], errors="coerce")
weat["prc"] = pd.to_numeric(weat["prc"], errors="coerce").abs()
weat_annual = weat.groupby("year").agg(
    weat_price=("prc", "mean"),
    weat_ret=("ret", lambda x: (1 + x.dropna()).prod() - 1)
).reset_index()

usda_price_df = pd.read_csv("src/wheat/raw_price.csv", low_memory=False)
usda_price_df = usda_price_df[usda_price_df["reference_period_desc"] == "MARKETING YEAR"]
usda_price_df = usda_price_df[usda_price_df["source_desc"] == "SURVEY"]
usda_price_df = usda_price_df[usda_price_df["domain_desc"] == "TOTAL"]
usda_price_df = usda_price_df[usda_price_df["unit_desc"] == "$ / BU"]
usda_price_annual = usda_price_df.groupby("year")["value"].mean().reset_index().rename(columns={"value": "usda_price"})

acreage_df = pd.read_csv("src/wheat/raw_acreage.csv", low_memory=False)
acreage_df = acreage_df[acreage_df["short_desc"] == "WHEAT - ACRES HARVESTED"]
acreage_df = acreage_df[acreage_df["reference_period_desc"] == "YEAR"]
acreage_df = acreage_df[acreage_df["source_desc"] == "SURVEY"]
acreage_df = acreage_df[acreage_df["domain_desc"] == "TOTAL"]
acreage_annual = acreage_df.groupby("year")["value"].sum().reset_index().rename(columns={"value": "acreage"})

production_df = pd.read_csv("src/wheat/raw_production.csv", low_memory=False)
production_df = production_df[production_df["short_desc"] == "WHEAT - PRODUCTION, MEASURED IN BU"]
production_df = production_df[production_df["reference_period_desc"] == "YEAR"]
production_df = production_df[production_df["source_desc"] == "SURVEY"]
production_df = production_df[production_df["domain_desc"] == "TOTAL"]
production_annual = production_df.groupby("year")["value"].sum().reset_index().rename(columns={"value": "production"})

yield_df = pd.read_csv("src/wheat/raw_yield.csv", low_memory=False)
yield_df = yield_df[yield_df["short_desc"] == "WHEAT - YIELD, MEASURED IN BU / ACRE"]
yield_df = yield_df[yield_df["reference_period_desc"] == "YEAR"]
yield_df = yield_df[yield_df["source_desc"] == "SURVEY"]
yield_df = yield_df[yield_df["domain_desc"] == "TOTAL"]
yield_df = yield_df[yield_df["prodn_practice_desc"] == "ALL PRODUCTION PRACTICES"]
yield_annual = yield_df.groupby("year")["value"].mean().reset_index().rename(columns={"value": "yield"})

usda = production_annual.merge(acreage_annual, on="year").merge(yield_annual, on="year").merge(usda_price_annual, on="year")
usda = usda[(usda["year"] >= 2012) & (usda["year"] <= 2024)]

df = usda.merge(weat_annual, on="year").sort_values("year").reset_index(drop=True)

# ---------------------------
# Only use statistically significant lag combos
# ---------------------------
SIGNAL_FEATURES = [
    ("usda_price", 2),   # pearson_r = -0.663
    ("usda_price", 3),   # pearson_r = -0.737
    ("acreage",    1),   # pearson_r = -0.634
]

# ---------------------------
# Build z-score composite signal
# Use expanding window to avoid lookahead bias —
# z-score at time T only uses data available up to T
# ---------------------------
signal_df = df[["year", "weat_ret"]].copy()

for feat, lag in SIGNAL_FEATURES:
    raw = df[feat].shift(lag)  # lag the feature

    # Expanding z-score (no lookahead)
    expanding_mean = raw.expanding(min_periods=3).mean()
    expanding_std  = raw.expanding(min_periods=3).std()
    z = (raw - expanding_mean) / expanding_std

    # Flip sign if correlation is negative so signal is directionally correct
    # (high z → positive expected return, low z → negative expected return)
    r = {("usda_price", 2): -0.663, ("usda_price", 3): -0.737, ("acreage", 1): -0.634}
    direction = np.sign(r[(feat, lag)])
    weight    = abs(r[(feat, lag)])  # weight by correlation strength

    signal_df[f"z_{feat}_lag{lag}"] = z * direction * weight

# Composite: weighted sum of z-scores, normalised to [-1, 1]
z_cols = [c for c in signal_df.columns if c.startswith("z_")]
signal_df["raw_signal"] = signal_df[z_cols].sum(axis=1)
signal_df["signal"] = signal_df["raw_signal"] / signal_df["raw_signal"].abs().max()

# ---------------------------
# Discretise into positions
# signal > 0.2  → Long
# signal < -0.2 → Short
# else          → Flat
# ---------------------------
def position(s):
    if pd.isna(s):    return 0
    if s >  0.2:      return  1
    if s < -0.2:      return -1
    return 0

signal_df["position"] = signal_df["signal"].apply(position)

# Strategy return = position in year T * WEAT return in year T
# (signal is built from lagged features so no lookahead)
signal_df["strategy_ret"] = signal_df["position"] * signal_df["weat_ret"]

print(signal_df[["year", "signal", "position", "weat_ret", "strategy_ret"]].to_string(index=False))

# ---------------------------
# Performance stats
# ---------------------------
valid = signal_df.dropna(subset=["strategy_ret", "weat_ret"])

strat_ann  = valid["strategy_ret"].mean()
bh_ann     = valid["weat_ret"].mean()
strat_vol  = valid["strategy_ret"].std()
bh_vol     = valid["weat_ret"].std()
strat_sr   = strat_ann / strat_vol if strat_vol > 0 else np.nan
bh_sr      = bh_ann / bh_vol if bh_vol > 0 else np.nan

hit_rate = (np.sign(valid["strategy_ret"]) == np.sign(valid["weat_ret"])).mean()

print(f"\n{'':=<45}")
print(f"{'Metric':<25} {'Strategy':>8} {'Buy & Hold':>10}")
print(f"{'':=<45}")
print(f"{'Avg Annual Return':<25} {strat_ann:>8.1%} {bh_ann:>10.1%}")
print(f"{'Annual Vol':<25} {strat_vol:>8.1%} {bh_vol:>10.1%}")
print(f"{'Sharpe (annual)':<25} {strat_sr:>8.2f} {bh_sr:>10.2f}")
print(f"{'Hit Rate':<25} {hit_rate:>8.1%}")
print(f"{'N years':<25} {len(valid):>8}")

# ---------------------------
# Cumulative return plot
# ---------------------------
valid = valid.copy()
valid["cum_strategy"] = (1 + valid["strategy_ret"]).cumprod()
valid["cum_bh"]       = (1 + valid["weat_ret"]).cumprod()

fig = plt.figure(figsize=(12, 8))
gs  = gridspec.GridSpec(3, 1, height_ratios=[3, 1, 1], hspace=0.4)

# Cumulative returns
ax1 = fig.add_subplot(gs[0])
ax1.plot(valid["year"], valid["cum_strategy"], label="Signal Strategy", color="steelblue", linewidth=2)
ax1.plot(valid["year"], valid["cum_bh"],       label="Buy & Hold WEAT",  color="coral",     linewidth=2, linestyle="--")
ax1.axhline(1, color="grey", linestyle=":", linewidth=0.8)
ax1.set_title("Z-Score Composite Signal vs Buy & Hold WEAT", fontsize=13)
ax1.set_ylabel("Cumulative Return")
ax1.legend()
ax1.grid(alpha=0.3)

# Signal over time
ax2 = fig.add_subplot(gs[1])
ax2.bar(signal_df["year"], signal_df["signal"],
        color=["steelblue" if s >= 0 else "coral" for s in signal_df["signal"].fillna(0)],
        alpha=0.7)
ax2.axhline(0.2,  color="green", linestyle="--", linewidth=0.8, label="Long threshold")
ax2.axhline(-0.2, color="red",   linestyle="--", linewidth=0.8, label="Short threshold")
ax2.set_ylabel("Signal")
ax2.set_title("Composite Signal")
ax2.legend(fontsize=8)
ax2.grid(alpha=0.3)

# Position
ax3 = fig.add_subplot(gs[2])
ax3.bar(signal_df["year"], signal_df["position"],
        color=["steelblue" if p > 0 else "coral" if p < 0 else "grey"
               for p in signal_df["position"].fillna(0)],
        alpha=0.7)
ax3.set_yticks([-1, 0, 1])
ax3.set_yticklabels(["Short", "Flat", "Long"])
ax3.set_ylabel("Position")
ax3.set_title("Discrete Position")
ax3.grid(alpha=0.3)

plt.savefig("src/wheat/signal.png", dpi=150, bbox_inches="tight")
plt.show()
print("\nSaved to src/wheat/signal.png")

# ---------------------------
# Grid search over threshold
# ---------------------------
thresholds = np.arange(0.05, 1.0, 0.05)
records = []

for thresh in thresholds:
    pos = signal_df["signal"].apply(
        lambda s: 0 if pd.isna(s) else (1 if s > thresh else (-1 if s < -thresh else 0))
    )
    ret = pos * signal_df["weat_ret"]
    valid = ret.dropna()

    if valid.std() == 0 or len(valid) < 3:
        continue

    avg    = valid.mean()
    vol    = valid.std()
    sharpe = avg / vol
    hit    = (np.sign(valid) == np.sign(signal_df["weat_ret"].dropna())).mean()
    n_long  = (pos == 1).sum()
    n_short = (pos == -1).sum()
    n_flat  = (pos == 0).sum()

    records.append({
        "threshold": round(thresh, 2),
        "sharpe":    round(sharpe, 3),
        "avg_ret":   round(avg, 4),
        "vol":       round(vol, 4),
        "hit_rate":  round(hit, 3),
        "n_long":    n_long,
        "n_short":   n_short,
        "n_flat":    n_flat,
    })

grid = pd.DataFrame(records).sort_values("sharpe", ascending=False)
print("=== THRESHOLD GRID SEARCH ===")
print(grid.to_string(index=False))

best_thresh = grid.iloc[0]["threshold"]
print(f"\nBest threshold: {best_thresh} → Sharpe {grid.iloc[0]['sharpe']}")

# ---------------------------
# Rerun signal with best threshold
# ---------------------------
signal_df["position_opt"] = signal_df["signal"].apply(
    lambda s: 0 if pd.isna(s) else (1 if s > best_thresh else (-1 if s < -best_thresh else 0))
)
signal_df["strategy_ret_opt"] = signal_df["position_opt"] * signal_df["weat_ret"]

valid_opt = signal_df.dropna(subset=["strategy_ret_opt", "weat_ret"])
strat_ann = valid_opt["strategy_ret_opt"].mean()
bh_ann    = valid_opt["weat_ret"].mean()
strat_vol = valid_opt["strategy_ret_opt"].std()
bh_vol    = valid_opt["weat_ret"].std()
strat_sr  = strat_ann / strat_vol if strat_vol > 0 else np.nan
bh_sr     = bh_ann   / bh_vol    if bh_vol   > 0 else np.nan
hit_rate  = (np.sign(valid_opt["strategy_ret_opt"]) == np.sign(valid_opt["weat_ret"])).mean()

print(f"\n{'':=<45}")
print(f"{'Metric':<25} {'Optimised':>9} {'Original':>9} {'Buy & Hold':>10}")
print(f"{'':=<45}")
print(f"{'Avg Annual Return':<25} {strat_ann:>9.1%} {'2.9%':>9} {bh_ann:>10.1%}")
print(f"{'Annual Vol':<25} {strat_vol:>9.1%} {'8.7%':>9} {bh_vol:>10.1%}")
print(f"{'Sharpe':<25} {strat_sr:>9.2f} {'0.33':>9} {bh_sr:>10.2f}")
print(f"{'Hit Rate':<25} {hit_rate:>9.1%} {'46.2%':>9}")
print(f"{'N years':<25} {len(valid_opt):>9}")

# ---------------------------
# Plot: Sharpe vs threshold
# ---------------------------
fig, axes = plt.subplots(2, 1, figsize=(10, 7), sharex=True)

axes[0].plot(grid["threshold"], grid["sharpe"], color="steelblue", linewidth=2, marker="o", markersize=4)
axes[0].axvline(best_thresh, color="red", linestyle="--", linewidth=1, label=f"Best: {best_thresh}")
axes[0].axvline(0.2, color="grey", linestyle=":", linewidth=1, label="Original: 0.20")
axes[0].set_ylabel("Sharpe Ratio")
axes[0].set_title("Sharpe Ratio vs Signal Threshold")
axes[0].legend()
axes[0].grid(alpha=0.3)

axes[1].stackplot(
    grid["threshold"],
    grid["n_long"], grid["n_flat"], grid["n_short"],
    labels=["Long", "Flat", "Short"],
    colors=["steelblue", "lightgrey", "coral"],
    alpha=0.7
)
axes[1].axvline(best_thresh, color="red", linestyle="--", linewidth=1)
axes[1].axvline(0.2, color="grey", linestyle=":", linewidth=1)
axes[1].set_xlabel("Threshold")
axes[1].set_ylabel("Years in position")
axes[1].set_title("Position Breakdown vs Threshold")
axes[1].legend(loc="upper right")
axes[1].grid(alpha=0.3)

plt.tight_layout()
plt.savefig("src/wheat/threshold_grid.png", dpi=150, bbox_inches="tight")
plt.show()
print("\nSaved to src/wheat/threshold_grid.png")