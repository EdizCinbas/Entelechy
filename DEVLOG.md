# Entelechy Development Log

## Project Overview
Entelechy is an analytical dashboard and data engine for agricultural data. The main idea was to use satellite imagery to predict crop yields, but we have extended it with all sorts of agriculture relevant data. The project is a baseline for building commodity algorithms, and we have made a wheat algorithm using the engine as demonstration of its use case, with almost 70% return.

The stack is a Python backend with a React frontend to deliver environmental analysis. The backend executes geospatial imagery extraction, news sentiment scoring, and uses that in algorithmic strategies that return well above the buy and hold benchmark. 

The React and TypeScript frontend renders information visually such as satellite imagery, dynamic graphs, news and sentiment feeds, weather and flood data. The frontend is not meant to be used for trading, it is just to demonstrate the different data sources, as well as display the trading algorithm we made.

The backend should use this data displayed in the frontend to make trading decisions. Due to API limits we have only written a wheat algorithm, but given its massive success, the other data seen in the frontend such as for almonds or corn can be used to do the same thing.

## Implementation Details
The backend calculates Normalized Difference Vegetation Index (NDVI) for farm regions using the Sentinel Hub Process API. Simultaneously, a news service polls commodity headlines and computes explicit market sentiment probabilities via FinBERT classification model.

The frontend integrates these streams. A 3D globe maps critical agricultural regions and local weather from the Open-Meteo API upon selection. Clicking on regions displays the satellite pictures of the top 4 relevant farms, which are used in our wheat algorithm for crop yield analysis.

## Data Ingestion and Transformation Pipeline

The pipeline queries the Google Earth Engine API to construct a multi-source time series dataset for US wheat regions (Kansas HRW, North Dakota HRS) over 2015–2024.

**Data sources:**
- USDA NASS (KS + ND): production, yield, acreage, price received
- Sentinel-2: NDVI (greenness), NDWI (water content)
- MODIS: Land Surface Temperature 
- SMAP: Soil moisture  
- CHIRPS: Precipitation
- WRDS (WEAT price data)

Firstly, we use data from the USDA National Agricultural Statistics Service (NASS) QuickStats API, focusing on U.S. wheat fundamentals. The data that we pull is only published yearly, hence we use it in combination with the satellite image data (detailed below).

We use USDA CDL data to map regions containing wheat plots to find where wheat is planted for the year and filter to keep data isolated for those regions.

Time series are merged and resampled to daily and weekly frequency with forward-fill for daily data to handle irregular sampling. SMAP is pre-aggregated weekly to reduce query cost.

Processing is done per region-season with checkpointed outputs to ensure idempotency and fault tolerance.

**Outputs:**
- Daily panel dataset  
- Weekly aggregated dataset (mean features, summed rainfall) optimized for modelling

| Source | Resolution | Cadence | Metric Extracted |
| :--- | :--- | :--- | :--- |
| Sentinel-2 (ESA) | 10m | ~5-day | NDVI, NDWI, EVI |
| MODIS MOD11A1 (NASA) | 1km | Daily | Land Surface Temperature |
| SMAP SPL4SMGP (NASA) | 9km | Variable | Soil Moisture |
| CHIRPS (UCSB) | 5km | Daily | Precipitation |

## Evaluation and Backtesting

### 1. Feature Engineering & Alignment
- **USDA:**
  - Lag features (t-2, t-3) to capture delayed supply effects
- **Satellite:**
  - Derive vegetation indices
  - Smooth noise (e.g. weekly soil moisture)
  - Apply crop masking (CDL)
- **Alignment:**
  - Unified into a consistent time series
  - Resampled from daily → monthly/annual views

### . Data Correlation
- Correlate features at different lags to the price of WEAT
- Uses only historical data (no lookahead bias)

### 4. Core Signal (USDA-Driven, Annual)
- Correlation-weighted composite:
  - Lagged price → bearish
  - Lagged yield → bullish
- Normalised to [-1, 1]

### 5. Temporal Extrapolation via Satellite Data
- Fit higher-frequency satellite features to the annual USDA signal:
  - USDA signal = strong but sparse (published annually)
  - Satellite data = weaker but higher frequency and correlated
- Extrapolate signal intra-year
- Produces a monthly tradable signal

### 6. Regime Adjustment
- Gated using YoY momentum (WEAT):
  - Agreement: full signal
  - Conflict: reduced exposure 

### 7. Decay, Thresholding & Execution
- Exponential decay (half-life ≈ 5 months)
- 25% threshold:
  - Go flat below noise floor
- Final output:
  - Monthly position sizing in [-1, 1]

### 8: Backtest
- Trade the WEAT ETF from 2015 to 2024 (some features are heavily lagged, hence starting later than 2012 when the data begins)

### Notes on Robust Pipeline Infrastructure
- Handles heterogeneous satellite data:
  - Different resolutions, cadences, schema drift
- Includes:
  - Cloud filtering
  - Dynamic band handling
  - Checkpointed ingestion
- Outputs:
  - Model-ready feature tables for forecasting and trading
- Reaslistic Backtest:
  - No data leakage or lookahead bias involved

### WEAT Wheat Signal Strategy
This systematic strategy exploits multi-year agricultural supply cycles in Kansas and North Dakota applying USDA supply statistics and satellite remote sensing. Evaluated over a 2016-2024 test window, the final strategy delivered a 0.626 Sharpe ratio against a severely negative buy-and-hold benchmark.

### Performance Tracking

| Metric | Strategy | Buy & Hold WEAT |
| :--- | :--- | :--- |
| Annualised Return | 4.15% | -8.98% |
| Annualised Vol | 6.62% | 24.07% |
| Sharpe Ratio | 0.626 | -0.373 |
| Max Drawdown | -10.37% | -80.52% |
| Win Rate (monthly) | 18.7% | 45.2% |
| Live Period | 2016–2024 | 2016–2024 |

*Note: Win rate appears low due to the framework defaulting to holding cash whenever the decayed monthly signal falls below a 25 percent activation threshold.*

### Data Sources
USDA NASS API data targets Kansas and North Dakota covering production, acreage, yield, and price variables from survey-derived domains. Satellite remote sensing spanned corresponding growing seasons tracking vegetation indices, soil moisture, rainfall, and Land Surface Temperature. Returns were matched against Teucrium Wheat Fund (WEAT) compounded daily prices correcting for bid-ask negative reporting conventions. 

### Signal Construction
Signal generation isolates significant lag relationships. High farm prices at 2-year and 3-year lags typically generate acreage expansion and eventual supply gluts, whereas high yields at a 2-year lag signal persistent agronomic strength. 

Features are standardized via non-lookahead expanding-window z-scores and weighted by absolute Pearson correlation strength. This raw structural signal is gated by a regime filter halving position sizes whenever direct WEAT price momentum conflicts with the fundamental thesis. Because USDA structural figures age throughout the operational year, the monthly position strength decays exponentially at a 5-month half-life ending automatically at a 25 percent minimum-participation threshold to minimize flat-market transaction drag.

### Final Specification Summary

| Parameter | Value |
| :--- | :--- |
| Universe | WEAT ETF |
| Signal states | Kansas (HRW) + North Dakota (HRS) |
| Core features | USDA price lag 2, yield lag 2, price lag 3 |
| Normalisation / Filter | Expanding-window z-score gated by YoY WEAT momentum |
| Decay / Exit | 5-month half-life exponential decay, 25% minimum floor |
| Backtest period | 2012–2024 (live signals from 2016) |
| Sharpe / Drawdown | 0.626 (net) / -10.37% |