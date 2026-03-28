import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import matplotlib.ticker as mticker
from matplotlib.patches import FancyBboxPatch
import warnings
warnings.filterwarnings("ignore")

# ─── STYLE ────────────────────────────────────────────────────────────────────
plt.rcParams.update({
    "font.family":        "serif",
    "font.serif":         ["Georgia", "Times New Roman", "DejaVu Serif"],
    "axes.spines.top":    False,
    "axes.spines.right":  False,
    "axes.linewidth":     0.6,
    "axes.labelsize":     9,
    "axes.titlesize":     10,
    "axes.titleweight":   "bold",
    "xtick.labelsize":    8,
    "ytick.labelsize":    8,
    "legend.fontsize":    8,
    "legend.framealpha":  0.9,
    "legend.edgecolor":   "#cccccc",
    "grid.color":         "#e8e8e8",
    "grid.linewidth":     0.6,
    "figure.facecolor":   "white",
    "axes.facecolor":     "#fafafa",
})

NAVY    = "#1a2e4a"
STEEL   = "#2c6fad"
CORAL   = "#c94f3d"
SAGE    = "#4a7c6e"
GOLD    = "#c8962f"
LIGHT   = "#f0f4f8"
MID     = "#d0dbe8"

# ─── PARAMETERS ───────────────────────────────────────────────────────────────
TRANSACTION_COST  = 0.001
STARTING_CAPITAL  = 100_000
DECAY_HL          = 5
MIN_POS_THRESHOLD = 0.25
decay_lambda      = np.log(2) / DECAY_HL

# ─── DATA ─────────────────────────────────────────────────────────────────────
weat = pd.read_csv("src/wheat/WEAT_stock_prices.csv")
weat["date"]  = pd.to_datetime(weat["date"])
weat["ret"]   = pd.to_numeric(weat["ret"],  errors="coerce")
weat["prc"]   = pd.to_numeric(weat["prc"],  errors="coerce").abs()
weat          = weat[(weat["date"].dt.year >= 2012) & (weat["date"].dt.year <= 2024)]
weat["year"]  = weat["date"].dt.year
weat["month"] = weat["date"].dt.month

weat_monthly = weat.groupby(weat["year"]*100 + weat["month"]).agg(
    year       = ("year",  "first"),
    month      = ("month", "first"),
    weat_ret   = ("ret",   lambda x: (1 + x.dropna()).prod() - 1),
    weat_price = ("prc",   "mean"),
    month_end  = ("date",  "max"),
).reset_index(drop=True).sort_values("month_end").reset_index(drop=True)

# ─── SIGNAL ───────────────────────────────────────────────────────────────────
regime_annual = pd.DataFrame({
    "year":   [2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024],
    "signal": [np.nan,np.nan,np.nan,np.nan,
               -1.000, 0.500, 0.500, 0.229,
                0.275, 0.694, 0.428,-0.486,-0.919],
})

monthly = weat_monthly.merge(regime_annual, on="year", how="left")
monthly["decay"]          = np.exp(-decay_lambda * (monthly["month"] - 1))
monthly["signal_decayed"] = monthly["signal"] * monthly["decay"]

raw_pos             = monthly["signal_decayed"].clip(-1, 1).fillna(0)
monthly["position"] = np.where(raw_pos.abs() >= MIN_POS_THRESHOLD, raw_pos, 0.0)

monthly["pos_chg"]   = monthly["position"].diff().abs()
monthly["gross_ret"] = monthly["position"].shift(1) * monthly["weat_ret"]
monthly["net_ret"]   = monthly["gross_ret"] - monthly["pos_chg"] * TRANSACTION_COST
monthly              = monthly.dropna(subset=["gross_ret"]).copy()

monthly["cum_net"] = STARTING_CAPITAL * (1 + monthly["net_ret"]).cumprod()
monthly["cum_bh"]  = STARTING_CAPITAL * (1 + monthly["weat_ret"]).cumprod()

# ─── PERFORMANCE FUNCTION ─────────────────────────────────────────────────────
def compute_perf(rets, label, mpy=12):
    r     = rets.dropna()
    ann_r = r.mean() * mpy
    ann_v = r.std()  * np.sqrt(mpy)
    sr    = ann_r / ann_v if ann_v > 0 else np.nan
    cum   = (1 + r).cumprod()
    dd    = ((cum - cum.cummax()) / cum.cummax()).min()
    cal   = ann_r / abs(dd) if dd != 0 else np.nan
    neg   = r[r < 0]
    sor   = ann_r / (neg.std() * np.sqrt(mpy)) if len(neg) > 0 else np.nan
    win   = (r > 0).mean()
    return dict(label=label, ann_ret=ann_r, ann_vol=ann_v, sharpe=sr,
                sortino=sor, max_dd=dd, calmar=cal, win_rate=win, n=len(r))

p_final = compute_perf(monthly["net_ret"],  "Strategy")
p_bh    = compute_perf(monthly["weat_ret"], "Buy & Hold WEAT")

# ─── ANNUAL ───────────────────────────────────────────────────────────────────
annual = monthly.groupby("year").apply(
    lambda x: pd.Series({
        "net_ret":       (1 + x["net_ret"]).prod() - 1,
        "gross_ret":     (1 + x["gross_ret"]).prod() - 1,
        "bh_ret":        (1 + x["weat_ret"]).prod() - 1,
        "avg_pos":        x["position"].mean(),
        "active_months": (x["position"].abs() > 0.01).sum(),
        "tc_drag":       ((1+x["gross_ret"]).prod() - (1+x["net_ret"]).prod()),
    }), include_groups=False
).reset_index()

# ─── PRINT METRICS ────────────────────────────────────────────────────────────
SEP = "=" * 64

def print_perf(p):
    print(f"\n{SEP}")
    print(f"  {p['label']}")
    print(SEP)
    print(f"  {'Ann. Return':<22} {p['ann_ret']:>+8.2%}")
    print(f"  {'Ann. Volatility':<22} {p['ann_vol']:>8.2%}")
    print(f"  {'Sharpe Ratio':<22} {p['sharpe']:>8.3f}")
    print(f"  {'Sortino Ratio':<22} {p['sortino']:>8.3f}")
    print(f"  {'Max Drawdown':<22} {p['max_dd']:>8.2%}")
    print(f"  {'Calmar Ratio':<22} {p['calmar']:>8.3f}")
    print(f"  {'Win Rate':<22} {p['win_rate']:>8.1%}")
    print(f"  {'Months':<22} {p['n']:>8d}")

print_perf(p_final)
print_perf(p_bh)

print(f"\n{SEP}")
print(f"  ALPHA SUMMARY")
print(SEP)
print(f"  {'Sharpe advantage':<22} {p_final['sharpe'] - p_bh['sharpe']:>+8.3f}")
print(f"  {'Return advantage':<22} {p_final['ann_ret'] - p_bh['ann_ret']:>+8.2%}")
print(f"  {'DD improvement':<22} {p_bh['max_dd'] - p_final['max_dd']:>+8.2%}")

print(f"\n{SEP}")
print(f"  ANNUAL BREAKDOWN")
print(SEP)
print(f"  {'Year':>4}  {'Net Ret':>8}  {'BH Ret':>8}  {'Alpha':>8}  "
      f"{'Avg Pos':>8}  {'Act Mo':>6}  {'TC Drag':>8}")
for _, r in annual.iterrows():
    alpha = r["net_ret"] - r["bh_ret"]
    print(f"  {int(r['year']):>4}  {r['net_ret']:>8.2%}  {r['bh_ret']:>8.2%}  "
          f"{alpha:>+8.2%}  {r['avg_pos']:>8.3f}  "
          f"{int(r['active_months']):>6}  {r['tc_drag']:>8.4f}")

# ─── TRADE LOG ────────────────────────────────────────────────────────────────
monthly["prev_pos"] = monthly["position"].shift(1).fillna(0)
monthly["trade"]    = (monthly["position"].round(4) != monthly["prev_pos"].round(4))

trades, current = [], None
for _, row in monthly.iterrows():
    if row["trade"]:
        if current is not None:
            current["exit"]      = row["month_end"]
            current["total_ret"] = (1 + pd.Series(current["rets"])).prod() - 1
            trades.append(current)
        if abs(row["position"]) > 0.01:
            current = {"entry": row["month_end"], "dir": "LONG" if row["position"] > 0 else "SHORT",
                       "rets": [], "pos": [], "year": row["year"]}
        else:
            current = None
    if current:
        current["rets"].append(row["net_ret"])
        current["pos"].append(row["position"])

if current:
    current["exit"]      = monthly["month_end"].iloc[-1]
    current["total_ret"] = (1 + pd.Series(current["rets"])).prod() - 1
    trades.append(current)

trades_df = pd.DataFrame([{
    "year": t["year"], "entry": t["entry"], "exit": t["exit"],
    "direction": t["dir"], "months": len(t["rets"]),
    "avg_pos":   round(np.mean(t["pos"]), 3),
    "total_ret": round(t["total_ret"], 4),
    "best_mo":   round(max(t["rets"]), 4),
    "worst_mo":  round(min(t["rets"]), 4),
} for t in trades]).sort_values("total_ret", ascending=False)

strategy_at_entry = monthly[["month_end", "weat_price", "signal", "signal_decayed",
                              "position", "net_ret", "gross_ret", "cum_net", "cum_bh"]].rename(
    columns={"month_end": "entry"})
trades_df = trades_df.merge(strategy_at_entry, on="entry", how="left")

print(f"\n{SEP}")
print(f"  TRADE LOG  (sorted best → worst)")
print(SEP)
print(trades_df.to_string(index=False))

# ─── SAVE CSVs ────────────────────────────────────────────────────────────────
monthly.to_csv("src/wheat/FINAL_strategy.csv",     index=False)
annual.to_csv("src/wheat/FINAL_annual.csv",        index=False)
trades_df.to_csv("src/wheat/FINAL_trades.csv",     index=False)
pd.DataFrame([p_final, p_bh]).to_csv("src/wheat/FINAL_performance.csv", index=False)

# ─── FIGURE ───────────────────────────────────────────────────────────────────
fig = plt.figure(figsize=(13, 16), facecolor="white")
fig.suptitle(
    "WEAT Wheat Signal Strategy  ·  Final Presentation",
    fontsize=14, fontweight="bold", color=NAVY, y=0.985, x=0.5,
    fontfamily="serif"
)

subtitle = (
    "USDA Kansas + North Dakota Supply Regime Filter  ·  "
    "Exponential Decay (HL = 5m)  ·  25 % Minimum Position Threshold  ·  10 bps TC"
)
fig.text(0.5, 0.967, subtitle, ha="center", fontsize=8.5,
         color="#555555", fontstyle="italic")

gs = gridspec.GridSpec(4, 1, figure=fig,
                       height_ratios=[3.2, 1.1, 1.2, 1.1],
                       hspace=0.52,
                       left=0.09, right=0.95, top=0.95, bottom=0.05)

# ── helper: clean axis ──
def style_ax(ax, title, ylabel):
    ax.set_title(title, fontsize=10, fontweight="bold", color=NAVY,
                 loc="left", pad=6)
    ax.set_ylabel(ylabel, fontsize=8.5, color="#444444")
    ax.tick_params(colors="#555555")
    ax.yaxis.set_tick_params(length=3)
    ax.xaxis.set_tick_params(length=3)
    ax.grid(True, axis="y", color="#e0e6ed", linewidth=0.6, zorder=0)
    ax.grid(False, axis="x")

# ── Panel 1: Equity curve ─────────────────────────────────────────────────────
ax1 = fig.add_subplot(gs[0])

ax1.fill_between(monthly["month_end"], monthly["cum_net"],
                 STARTING_CAPITAL, where=monthly["cum_net"] >= STARTING_CAPITAL,
                 color=STEEL, alpha=0.08, zorder=1)
ax1.fill_between(monthly["month_end"], monthly["cum_net"],
                 STARTING_CAPITAL, where=monthly["cum_net"] < STARTING_CAPITAL,
                 color=CORAL, alpha=0.08, zorder=1)
ax1.plot(monthly["month_end"], monthly["cum_bh"],
         color=CORAL, linewidth=1.4, linestyle="--", alpha=0.75,
         label=f"Buy & Hold   Ann {p_bh['ann_ret']:+.1%}  ·  "
               f"Sharpe {p_bh['sharpe']:.2f}  ·  MaxDD {p_bh['max_dd']:.1%}",
         zorder=2)
ax1.plot(monthly["month_end"], monthly["cum_net"],
         color=STEEL, linewidth=2.2,
         label=f"Strategy      Ann {p_final['ann_ret']:+.1%}  ·  "
               f"Sharpe {p_final['sharpe']:.2f}  ·  MaxDD {p_final['max_dd']:.1%}",
         zorder=3)
ax1.axhline(STARTING_CAPITAL, color="#aaaaaa", linestyle=":", linewidth=0.8, zorder=1)

ax1.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"${v:,.0f}"))
style_ax(ax1, "Cumulative Portfolio Value", "NAV ($)")
ax1.legend(loc="upper left", frameon=True, fancybox=False,
           borderpad=0.7, labelcolor=NAVY)

# Annotate final values
for series, color, va in [(monthly["cum_net"], STEEL, "bottom"),
                           (monthly["cum_bh"],  CORAL, "top")]:
    last_val = series.iloc[-1]
    last_dt  = monthly["month_end"].iloc[-1]
    ax1.annotate(f"${last_val:,.0f}",
                 xy=(last_dt, last_val),
                 xytext=(6, 4 if va == "bottom" else -4),
                 textcoords="offset points",
                 fontsize=7.5, color=color, fontweight="bold")

# ── Panel 2: Drawdown ─────────────────────────────────────────────────────────
ax2 = fig.add_subplot(gs[1])

for col, color, lbl in [
    ("weat_ret", CORAL, "Buy & Hold"),
    ("net_ret",  STEEL, "Strategy"),
]:
    cum = (1 + monthly[col]).cumprod()
    dd  = (cum - cum.cummax()) / cum.cummax() * 100
    ax2.fill_between(monthly["month_end"], dd, 0,
                     alpha=0.55, color=color, label=lbl, zorder=2)

ax2.axhline(0, color="#aaaaaa", linewidth=0.6)
ax2.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:.0f}%"))
style_ax(ax2, "Drawdown", "Drawdown (%)")
ax2.legend(loc="lower left", frameon=True, fancybox=False, borderpad=0.6)

# ── Panel 3: Annual returns ───────────────────────────────────────────────────
ax3 = fig.add_subplot(gs[2])

years = annual["year"].astype(int).values
x     = np.arange(len(years))
w     = 0.32

bars_s = ax3.bar(x - w/2, annual["net_ret"] * 100, w,
                 color=[STEEL if v >= 0 else CORAL for v in annual["net_ret"]],
                 alpha=0.88, label="Strategy", zorder=2, linewidth=0)
bars_b = ax3.bar(x + w/2, annual["bh_ret"]  * 100, w,
                 color=[SAGE  if v >= 0 else GOLD  for v in annual["bh_ret"]],
                 alpha=0.75, label="Buy & Hold", zorder=2, linewidth=0)

ax3.axhline(0, color="#888888", linewidth=0.7)
ax3.set_xticks(x)
ax3.set_xticklabels(years, fontsize=7.5, rotation=0)
ax3.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:.0f}%"))
style_ax(ax3, "Annual Returns", "Return (%)")
ax3.legend(loc="upper right", frameon=True, fancybox=False, borderpad=0.6)

# ── Panel 4: Position / signal ────────────────────────────────────────────────
ax4 = fig.add_subplot(gs[3])

ax4.fill_between(monthly["month_end"], monthly["position"], 0,
                 where=monthly["position"] > 0,
                 color=STEEL, alpha=0.70, label="Long", zorder=2)
ax4.fill_between(monthly["month_end"], monthly["position"], 0,
                 where=monthly["position"] < 0,
                 color=CORAL, alpha=0.70, label="Short", zorder=2)
ax4.plot(monthly["month_end"], monthly["signal_decayed"],
         color=NAVY, linewidth=0.9, linestyle="--", alpha=0.35,
         label="Decayed signal (pre-filter)", zorder=3)

for level, color, label in [
    ( MIN_POS_THRESHOLD, SAGE, f"+{MIN_POS_THRESHOLD:.0%} threshold"),
    (-MIN_POS_THRESHOLD, GOLD, f"−{MIN_POS_THRESHOLD:.0%} threshold"),
]:
    ax4.axhline(level, color=color, linestyle=":", linewidth=0.9,
                alpha=0.8, label=label)

ax4.axhline(0, color="#aaaaaa", linewidth=0.6)
ax4.set_ylim(-1.15, 1.15)
ax4.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:+.0%}"))
style_ax(ax4, "Position Sizing", "Position / Signal")
ax4.legend(loc="lower left", frameon=True, fancybox=False,
           borderpad=0.6, ncol=2, fontsize=7.5)


# ── Footer ────────────────────────────────────────────────────────────────────
fig.text(
    0.5, 0.012,
    f"Strategy: USDA KS+ND Regime (price + yield lag 2–3yr), gated by WEAT momentum  ·  "
    f"TC = {TRANSACTION_COST*10000:.0f} bps/unit  ·  Capital = ${STARTING_CAPITAL:,}  ·  Live from 2016",
    ha="center", fontsize=7, color="#777777", fontstyle="italic"
)

plt.savefig("src/wheat/FINAL_strategy.png", dpi=180, bbox_inches="tight",
            facecolor="white")
plt.show()
print("\n  ✓  Figure saved → src/wheat/FINAL_strategy.png")
print("  ✓  CSVs saved  → src/wheat/FINAL_*.csv\n")