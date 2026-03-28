import requests
import pandas as pd
import time

API_KEY = "YOUR_API_KEY"
BASE_URL = "https://quickstats.nass.usda.gov/api/api_GET/"

COMMON_PARAMS = {
    "key": API_KEY,
    "commodity_desc": "CORN",
    "agg_level_desc": "STATE",
    "state_alpha": "IL,IA",
    "year__GE": "2000",
    "format": "json"
}

# ---------------------------
# Safe fetch (handles size issues)
# ---------------------------
def fetch_chunk(stat, extra_params=None):
    params = COMMON_PARAMS.copy()
    params["statisticcat_desc"] = stat
    if extra_params:
        params.update(extra_params)

    print(f"Fetching {stat}...")

    response = requests.get(BASE_URL, params=params)

    if response.status_code == 413:
        raise Exception(f"Query too large for {stat} — need further filtering")

    if response.status_code != 200:
        raise Exception(f"HTTP Error {response.status_code}: {response.text}")

    data = response.json()

    if "data" not in data or len(data["data"]) == 0:
        raise Exception(f"No data returned for {stat}")

    df = pd.DataFrame(data["data"])

    # Clean
    df["value"] = (
        df["Value"]
        .str.replace(",", "", regex=False)
        .replace("(D)", None)
        .replace("(Z)", None)
    )
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["year"] = df["year"].astype(int)

    return df


# ---------------------------
# Fetch only what we need
# ---------------------------
production = fetch_chunk("PRODUCTION")
production.to_csv("raw_production.csv", index=False)
print("Saved raw_production.csv")
time.sleep(1)

yield_df = fetch_chunk("YIELD")
yield_df.to_csv("raw_yield.csv", index=False)
print("Saved raw_yield.csv")
time.sleep(1)

acreage = fetch_chunk("AREA HARVESTED", {"unit_desc": "ACRES", "state_alpha": "IL,IA"})
acreage.to_csv("raw_acreage.csv", index=False)
print("Saved raw_acreage.csv")
time.sleep(1)

price = fetch_chunk("PRICE RECEIVED")
price.to_csv("raw_price.csv", index=False)
print("Saved raw_price.csv")

# ---------------------------
# Filter only "ALL WHEAT"
# ---------------------------
def filter_all_wheat(df):
    return df[df["short_desc"].str.contains("CORN, ALL", na=False)]

production = filter_all_wheat(production)
yield_df  = filter_all_wheat(yield_df)
acreage   = filter_all_wheat(acreage)
price     = filter_all_wheat(price)

# ---------------------------
# Aggregate correctly
# ---------------------------
prod = production.groupby("year")["value"].sum()
area = acreage.groupby("year")["value"].sum()

# Weighted yield
yld = yield_df.merge(
    acreage,
    on=["year", "state_alpha"],
    suffixes=("_yld", "_area")
)
yld["weighted"] = yld["value_yld"] * yld["value_area"]
yld = yld.groupby("year")["weighted"].sum() / area

# Price (avg)
prc = price.groupby("year")["value"].mean()

# ---------------------------
# Final dataframe
# ---------------------------
df = pd.DataFrame({
    "year": prod.index,
    "production": prod.values,
    "acreage": area.values,
    "yield": yld.values,
    "price": prc.values
})

df = df.sort_values("year").reset_index(drop=True)

# Fill gaps
df[["production", "yield", "acreage", "price"]] = df[
    ["production", "yield", "acreage", "price"]
].ffill()

# Features
df["production_growth"] = df["production"].pct_change()
df["yield_growth"] = df["yield"].pct_change()
df["acreage_growth"] = df["acreage"].pct_change()

df["yield_lag1"] = df["yield"].shift(1)
df["production_lag1"] = df["production"].shift(1)

df["supply_shock"] = df["production"] - df["production_lag1"]

print("\nFinal dataset:")
print(df.tail())

df.to_csv("corn_dataset.csv", index=False)
print("\nSaved to corn_dataset.csv")