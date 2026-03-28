import pandas as pd
import numpy as np
from scipy import stats
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

STATES = ["KS", "ND"]

# ---------------------------
# USDA loaders
# ---------------------------
def load_usda(path, stat_filter, short_desc_exact):
    df = pd.read_csv(path, low_memory=False)
    df = df[df["short_desc"] == short_desc_exact]
    df = df[df["reference_period_desc"] == "YEAR"]
    df = df[df["source_desc"] == "SURVEY"]
    df = df[df["domain_desc"] == "TOTAL"]
    df = df[df["state_alpha"].isin(STATES)]
    annual = df.groupby("year")["value"].sum().reset_index()
    annual.columns = ["year", stat_filter]
    return annual

def load_yield(path, acreage_path):
    df = pd.read_csv(path, low_memory=False)
    df = df[df["short_desc"] == "WHEAT - YIELD, MEASURED IN BU / ACRE"]
    df = df[df["reference_period_desc"] == "YEAR"]
    df = df[df["source_desc"] == "SURVEY"]
    df = df[df["domain_desc"] == "TOTAL"]
    df = df[df["prodn_practice_desc"] == "ALL PRODUCTION PRACTICES"]
    df = df[df["state_alpha"].isin(STATES)]
    ac = pd.read_csv(acreage_path, low_memory=False)
    ac = ac[ac["short_desc"] == "WHEAT - ACRES HARVESTED"]
    ac = ac[ac["reference_period_desc"] == "YEAR"]
    ac = ac[ac["source_desc"] == "SURVEY"]
    ac = ac[ac["domain_desc"] == "TOTAL"]
    ac = ac[ac["state_alpha"].isin(STATES)]
    ac = ac[["year", "state_alpha", "value"]].rename(columns={"value": "state_acreage"})
    df = df.merge(ac, on=["year", "state_alpha"])
    df["weighted"] = df["value"] * df["state_acreage"]
    result = df.groupby("year").apply(
        lambda x: x["weighted"].sum() / x["state_acreage"].sum(),
        include_groups=False
    ).reset_index()
    result.columns = ["year", "yield"]
    return result

def load_price(path):
    df = pd.read_csv(path, low_memory=False)
    df = df[df["reference_period_desc"] == "MARKETING YEAR"]
    df = df[df["source_desc"] == "SURVEY"]
    df = df[df["domain_desc"] == "TOTAL"]
    df = df[df["unit_desc"] == "$ / BU"]
    df = df[df["state_alpha"].isin(STATES)]
    return df.groupby("year")["value"].mean().reset_index().rename(columns={"value": "usda_price"})

production = load_usda("src/wheat/raw_production.csv", "production", "WHEAT - PRODUCTION, MEASURED IN BU")
acreage    = load_usda("src/wheat/raw_acreage.csv",    "acreage",    "WHEAT - ACRES HARVESTED")
yield_df   = load_yield("src/wheat/raw_yield.csv", "src/wheat/raw_acreage.csv")
price_df   = load_price("src/wheat/raw_price.csv")

usda = production.merge(acreage, on="year").merge(yield_df, on="year").merge(price_df, on="year")
usda = usda[(usda["year"] >= 2012) & (usda["year"] <= 2024)]

# ---------------------------
# WEAT — keep daily for monthly return calculation
# ---------------------------
weat = pd.read_csv("src/wheat/WEAT_stock_prices.csv")
weat["date"] = pd.to_datetime(weat["date"])
weat["ret"]  = pd.to_numeric(weat["ret"],  errors="coerce")
weat["prc"]  = pd.to_numeric(weat["prc"],  errors="coerce").abs()
weat = weat[(weat["date"].dt.year >= 2012) & (weat["date"].dt.year <= 2024)]
weat["year"]  = weat["date"].dt.year
weat["month"] = weat["date"].dt.month
weat["ym"]    = weat["year"] * 100 + weat["month"]

weat_monthly = weat.groupby("ym").agg(
    year        = ("year",  "first"),
    month       = ("month", "first"),
    weat_ret    = ("ret",   lambda x: (1 + x.dropna()).prod() - 1),
    weat_price  = ("prc",   "mean"),
    month_end   = ("date",  "max"),
).reset_index().sort_values("month_end").reset_index(drop=True)

weat_annual = weat.groupby("year").agg(
    weat_price=("prc",  "mean"),
    weat_ret  =("ret",  lambda x: (1 + x.dropna()).prod() - 1)
).reset_index()

# ---------------------------
# USDA annual signal
# Significant features from earlier: usda_price lag2, yield lag2, usda_price lag3
# ---------------------------
df_annual = usda.merge(weat_annual, on="year").sort_values("year").reset_index(drop=True)

USDA_SIGNAL_FEATURES = [
    ("usda_price", 2, -0.725),
    ("yield",      2,  0.725),
    ("usda_price", 3, -0.662),
]

usda_signal = df_annual[["year"]].copy()
for feat, lag, r in USDA_SIGNAL_FEATURES:
    raw      = df_annual[feat].shift(lag)
    exp_mean = raw.expanding(min_periods=3).mean()
    exp_std  = raw.expanding(min_periods=3).std()
    z        = (raw - exp_mean) / exp_std
    usda_signal[f"z_{feat}_lag{lag}"] = z * np.sign(r) * abs(r)

z_cols = [c for c in usda_signal.columns if c.startswith("z_")]
usda_signal["usda_raw"] = usda_signal[z_cols].sum(axis=1)
max_abs = usda_signal["usda_raw"].abs().expanding(min_periods=3).max()
usda_signal["usda_signal"] = usda_signal["usda_raw"] / max_abs
usda_signal = usda_signal[["year", "usda_signal"]]

print("=== USDA ANNUAL SIGNAL ===")
print(usda_signal.to_string(index=False))

# ---------------------------
# Satellite stress score — monthly
# Average KS + ND, compute z-score per metric per month
# Stress = high LST, low NDVI, low soil moisture → bearish supply → bullish price → long WEAT
# ---------------------------
sat = pd.read_csv("src/wheat/wheat_all_metrics_daily_2015_2024.csv")
sat["date"]  = pd.to_datetime(sat["date"])
sat = sat.dropna(subset=["year"])
sat["year"]  = sat["year"].astype(int)
sat["month"] = sat["date"].dt.month
sat["ym"]    = sat["year"] * 100 + sat["month"]

SAT_METRICS = ["ndvi", "ndwi", "lst_c", "soil_moisture", "rainfall_mm"]

# Average KS + ND per day, then aggregate to monthly
sat_combined = sat.groupby(["date", "year", "month", "ym"])[SAT_METRICS].mean().reset_index()
sat_monthly = sat_combined.groupby("ym").agg(
    year          = ("year",          "first"),
    month         = ("month",         "first"),
    ndvi          = ("ndvi",          "mean"),
    ndwi          = ("ndwi",          "mean"),
    lst_c         = ("lst_c",         "mean"),
    lst_max       = ("lst_c",         "max"),
    soil_moisture = ("soil_moisture", "mean"),
    rainfall_mm   = ("rainfall_mm",   "sum"),
).reset_index().sort_values("ym").reset_index(drop=True)

# Growing season only: KS Mar-Jun, ND May-Aug → combined active window Mar-Aug
sat_monthly = sat_monthly[sat_monthly["month"].between(3, 8)].copy()

# Stress score: z-score each metric using expanding window, then combine
# Signs: high LST → stress (bullish) → positive stress
#        low NDVI → stress (bullish) → positive stress
#        low NDWI → stress (bullish) → positive stress  
#        low soil_moisture → stress (bullish) → positive stress
#        low rainfall → stress (bullish) → positive stress
STRESS_METRICS = [
    ("lst_max",       +1),   # high heat = stress
    ("lst_c",         +1),   # high temp = stress
    ("ndvi",          -1),   # low vegetation = stress
    ("ndwi",          -1),   # low water index = stress
    ("soil_moisture", -1),   # low moisture = stress
    ("rainfall_mm",   -1),   # low rainfall = stress
]

STRESS_WEIGHTS = {
    "lst_max":       0.815,  # from annual correlation ks_lst_max lag0
    "lst_c":         0.650,  # from annual correlation nd_lst_max lag0
    "ndvi":          0.260,  # from monthly correlation ndvi april
    "ndwi":          0.269,  # from monthly correlation ndwi april
    "soil_moisture": 0.327,  # from monthly correlation soil_moisture sep
    "rainfall_mm":   0.126,  # from monthly correlation rainfall may
}

sat_monthly = sat_monthly.copy()
for metric, direction in STRESS_METRICS:
    exp_mean = sat_monthly[metric].expanding(min_periods=5).mean()
    exp_std  = sat_monthly[metric].expanding(min_periods=5).std()
    z = (sat_monthly[metric] - exp_mean) / exp_std
    w = STRESS_WEIGHTS.get(metric, 1.0)
    sat_monthly[f"stress_{metric}"] = z * direction * w

stress_cols = [c for c in sat_monthly.columns if c.startswith("stress_")]
sat_monthly["stress_raw"] = sat_monthly[stress_cols].sum(axis=1)

# Normalise stress score to [-1, 1] using expanding window
stress_max = sat_monthly["stress_raw"].abs().expanding(min_periods=5).max()
sat_monthly["stress_score"] = sat_monthly["stress_raw"] / stress_max

print("\n=== SATELLITE STRESS SCORE (sample) ===")
print(sat_monthly[["ym", "year", "month", "stress_score"]].tail(20).to_string(index=False))

# ---------------------------
# Merge into monthly signal frame
# ---------------------------
# Expand USDA annual signal to cover all months of that year
monthly = weat_monthly.copy()
monthly = monthly.merge(usda_signal, on="year", how="left")
monthly = monthly.merge(
    sat_monthly[["ym", "stress_score"]],
    on="ym", how="left"
)

# Outside growing season: stress_score = 0 (no satellite update)
monthly["stress_score"] = monthly["stress_score"].fillna(0)

# ---------------------------
# Combined signal with override logic
# 
# Base signal = usda_signal (annual, constant within year)
# If abs(stress_score) > OVERRIDE_THRESHOLD → satellite overrides
# Otherwise → blend with stress contributing up to 40% weight
# ---------------------------
OVERRIDE_THRESHOLD = 0.6   # stress must be this strong to flip annual signal
STRESS_WEIGHT      = 0.4   # satellite weight in blend when not overriding

def combine_signals(usda_sig, stress, override_thresh, stress_weight):
    if pd.isna(usda_sig):
        return np.nan
    if abs(stress) >= override_thresh:
        # Satellite strong enough to override — take weighted average
        # but allow sign flip
        return (1 - stress_weight) * usda_sig + stress_weight * stress
    else:
        # Blend: satellite modulates but can't flip
        blended = (1 - stress_weight) * usda_sig + stress_weight * stress
        # Preserve sign of USDA signal
        return np.sign(usda_sig) * abs(blended) if usda_sig != 0 else blended

monthly["combined_signal"] = monthly.apply(
    lambda row: combine_signals(
        row["usda_signal"], row["stress_score"],
        OVERRIDE_THRESHOLD, STRESS_WEIGHT
    ), axis=1
)

# ---------------------------
# Position from combined signal
# ---------------------------
THRESHOLD = 0.25
monthly["position"] = monthly["combined_signal"].apply(
    lambda s: 0 if pd.isna(s) else (1 if s > THRESHOLD else (-1 if s < -THRESHOLD else 0))
)
monthly["strategy_ret"] = monthly["position"] * monthly["weat_ret"]

print("\n=== MONTHLY SIGNAL TABLE ===")
print(monthly[["month_end", "year", "month", "usda_signal", "stress_score",
               "combined_signal", "position", "weat_ret", "strategy_ret"]]
      .to_string(index=False))

# ---------------------------
# Performance (monthly, annualised)
# ---------------------------
valid     = monthly.dropna(subset=["strategy_ret", "weat_ret"])
months_py = 12
strat_ann = valid["strategy_ret"].mean() * months_py
bh_ann    = valid["weat_ret"].mean()     * months_py
strat_vol = valid["strategy_ret"].std()  * np.sqrt(months_py)
bh_vol    = valid["weat_ret"].std()      * np.sqrt(months_py)
strat_sr  = strat_ann / strat_vol if strat_vol > 0 else np.nan
bh_sr     = bh_ann   / bh_vol    if bh_vol   > 0 else np.nan
hit_rate  = (np.sign(valid["strategy_ret"]) == np.sign(valid["weat_ret"])).mean()

n_overrides = (
    monthly["stress_score"].abs() >= OVERRIDE_THRESHOLD
).sum()

print(f"\n{'':=<55}")
print(f"{'Metric':<30} {'Strategy':>10} {'Buy & Hold':>10}")
print(f"{'':=<55}")
print(f"{'Ann. Return':<30} {strat_ann:>10.1%} {bh_ann:>10.1%}")
print(f"{'Ann. Vol':<30} {strat_vol:>10.1%} {bh_vol:>10.1%}")
print(f"{'Sharpe':<30} {strat_sr:>10.2f} {bh_sr:>10.2f}")
print(f"{'Hit Rate':<30} {hit_rate:>10.1%}")
print(f"{'N months':<30} {len(valid):>10}")
print(f"{'N satellite overrides':<30} {n_overrides:>10}")

# ---------------------------
# Threshold grid on combined signal
# ---------------------------
records = []
for thresh in np.arange(0.05, 1.0, 0.05):
    pos = monthly["combined_signal"].apply(
        lambda s: 0 if pd.isna(s) else (1 if s > thresh else (-1 if s < -thresh else 0))
    )
    ret = (pos * monthly["weat_ret"]).dropna()
    if ret.std() == 0 or len(ret) < 10:
        continue
    records.append({
        "threshold": round(thresh, 2),
        "sharpe":    round((ret.mean() * 12) / (ret.std() * np.sqrt(12)), 3),
        "ann_ret":   round(ret.mean() * 12, 4),
        "n_long":    (pos ==  1).sum(),
        "n_short":   (pos == -1).sum(),
        "n_flat":    (pos ==  0).sum(),
    })
grid = pd.DataFrame(records).sort_values("sharpe", ascending=False)
print("\n=== THRESHOLD GRID ===")
print(grid.to_string(index=False))
print(f"Best threshold: {grid.iloc[0]['threshold']} → Sharpe {grid.iloc[0]['sharpe']}")

# ---------------------------
# Plot
# ---------------------------
valid = valid.copy()
valid["cum_strategy"] = (1 + valid["strategy_ret"]).cumprod()
valid["cum_bh"]       = (1 + valid["weat_ret"]).cumprod()

fig = plt.figure(figsize=(14, 11))
gs  = gridspec.GridSpec(4, 1, height_ratios=[3, 1, 1, 1], hspace=0.5)

ax1 = fig.add_subplot(gs[0])
ax1.plot(valid["month_end"], valid["cum_strategy"],
         label="USDA + Satellite Strategy", color="steelblue", linewidth=1.8)
ax1.plot(valid["month_end"], valid["cum_bh"],
         label="Buy & Hold WEAT", color="coral", linewidth=1.8, linestyle="--")
ax1.axhline(1, color="grey", linestyle=":", linewidth=0.8)
ax1.set_title("Monthly Signal: USDA Annual + Satellite Stress Override", fontsize=12)
ax1.set_ylabel("Cumulative Return")
ax1.legend(); ax1.grid(alpha=0.3)

ax2 = fig.add_subplot(gs[1])
ax2.plot(monthly["month_end"], monthly["usda_signal"],
         color="steelblue", linewidth=1.2, label="USDA annual")
ax2.plot(monthly["month_end"], monthly["stress_score"],
         color="orange", linewidth=1.0, linestyle="--", label="Sat stress")
ax2.axhline( THRESHOLD, color="green", linestyle=":", linewidth=0.8)
ax2.axhline(-THRESHOLD, color="red",   linestyle=":", linewidth=0.8)
ax2.axhline(0, color="grey", linestyle="-", linewidth=0.5)
ax2.set_ylabel("Signal"); ax2.set_title("USDA vs Satellite Stress")
ax2.legend(fontsize=8); ax2.grid(alpha=0.3)

ax3 = fig.add_subplot(gs[2])
ax3.plot(monthly["month_end"], monthly["combined_signal"],
         color="purple", linewidth=1.2)
ax3.axhline( THRESHOLD, color="green", linestyle="--", linewidth=0.8)
ax3.axhline(-THRESHOLD, color="red",   linestyle="--", linewidth=0.8)
ax3.axhline(0, color="grey", linestyle=":", linewidth=0.5)
# Mark override months
override_months = monthly[monthly["stress_score"].abs() >= OVERRIDE_THRESHOLD]
ax3.scatter(override_months["month_end"], override_months["combined_signal"],
            color="red", s=20, zorder=5, label="Override active")
ax3.set_ylabel("Signal"); ax3.set_title("Combined Signal (red = satellite override active)")
ax3.legend(fontsize=8); ax3.grid(alpha=0.3)

ax4 = fig.add_subplot(gs[3])
pos_colors = ["steelblue" if p > 0 else "coral" if p < 0 else "lightgrey"
              for p in monthly["position"].fillna(0)]
ax4.bar(monthly["month_end"], monthly["position"],
        color=pos_colors, alpha=0.8, width=20)
ax4.set_yticks([-1, 0, 1]); ax4.set_yticklabels(["Short", "Flat", "Long"])
ax4.set_ylabel("Position"); ax4.set_title("Monthly Position")
ax4.grid(alpha=0.3)

plt.savefig("src/wheat/signal_monthly_combined.png", dpi=150, bbox_inches="tight")
plt.show()
print("\nSaved to src/wheat/signal_monthly_combined.png")