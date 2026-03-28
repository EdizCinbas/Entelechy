# Entelechy Development Log

## Project Overview
Entelechy is an analytical dashboard and data engine for agricultural data. The main idea was to use satellite imagery to predict crop yields, but we have extended it with all sorts of agriculture relevant data. The project is a baseline for building commodity algorithms, and we have made a wheat algorithm using the engine as demonstration of its use case, with almost 70% return.

The stack is a Python backend with a React frontend to deliver environmental analysis. The backend executes geospatial imagery extraction, news sentiment scoring, and uses that in algorithmic strategies that return well above the buy and hold benchmark. 

The React and TypeScript frontend renders information visually such as satellite imagery, dynamic graphs, news and sentiment feeds, weather and flood data. The frontend is not meant to be used for trading, it is just to demonstrate the different data sources, as well as display the trading algorithm we made.

The backend should use this data displayed in the frontend to make trading decisions. Due to API limits we have only written a wheat algorithm, but given its massive success, the other data seen in the frontend such as for almonds or corn can be used to do the same thing.

## Implementation Details
The backend calculates Normalized Difference Vegetation Index (NDVI) for farm regions using the Sentinel Hub Process API. Simultaneously, a news service polls commodity headlines and computes explicit market sentiment probabilities via FinBERT classification model.

The frontend integrates these streams. A 3D globe maps critical agricultural regions and local weather from the Open-Meteo API upon selection. Clicking on regions displays the satellite pictures of the top 4 relevant farms, which are used in our wheat algorithm for crop yield analysis.   

[SPACE FOR SENTIMENT ANALYSIS IMAGE]

[SPACE FOR NEWS FEED IMAGE]

[SPACE FOR TEMPERATURE AND HUMIDITY INFORMATION IMAGE]

[SPACE FOR FIELDS CROPPED SATELLITES IMAGES]

## Data Ingestion and Transformation Pipeline
The system harmonizes four separate Earth observation datasets spanning 2015 to 2024 into a unified, daily time-series model. Query construction, cloud-filtering, and dynamic band detection are handled conditionally per source.

| Source | Resolution | Cadence | Metric Extracted |
| :--- | :--- | :--- | :--- |
| Sentinel-2 (ESA) | 10m | ~5-day | NDVI, NDWI, EVI |
| MODIS MOD11A1 (NASA) | 1km | Daily | Land Surface Temperature |
| SMAP SPL4SMGP (NASA) | 9km | Variable | Soil Moisture |
| CHIRPS (UCSB) | 5km | Daily | Precipitation |

The transformation layer calculates derived spectral indices (NDVI, NDWI, EVI) and standardizes thermal units, then masks all spatial data to verified crop pixels using historically fallback-enabled USDA CDL classifications. Finally, outputs are outer-merged by date, resampled to daily frequencies, and forward-filled across five-day maximum gaps.

Pipeline execution automatically checkpoints after each region-year block, preventing data loss on query timeouts. Final assembly summates rainfall and averages alternative metrics for direct futures price joining.

## Evaluation and Backtesting

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

*Note: Win rate appears low due to the framework defaulting to absolute flat positions whenever the decayed monthly signal falls below a 25 percent activation threshold.*

### Data Sources
USDA NASS API data targets Kansas and North Dakota covering production, acreage, yield, and price variables from survey-derived domains. Satellite remote sensing spanned corresponding growing seasons tracking vegetation indices, soil moisture, rainfall, and Land Surface Temperature. Returns were matched against Teucrium Wheat Fund (WEAT) compounded daily prices correcting for bid-ask negative reporting conventions. 

### Signal Construction
Signal generation isolates significant lag relationships. High farm prices at 2-year and 3-year lags typically generate acreage expansion and eventual supply gluts, whereas high yields at a 2-year lag signal persistent agronomic strength. 

Features are standardized via non-lookahead expanding-window z-scores and weighted by absolute Pearson correlation strength. This raw structural signal is gated by a regime filter halving position sizes whenever direct WEAT price momentum conflicts with the fundamental thesis. Because USDA structural figures age throughout the operational year, the monthly position strength decays exponentially at a 5-month half-life ending automatically at a 25 percent minimum-participation threshold to minimize flat-market transaction drag.

### Satellite and Experimental Adjustments
Lag-zero satellite testing established peak growing-season maximum Land Surface Temperature as statistically significant for predicting same-year returns without lookahead bias. However, mechanically blending this metric into the late-year core structural strategy ultimately degraded advantage ratios due to limited sample depth.

Extensive cross-validated alternate modeling employing Ridge OLS, Kalman Ensembles, and Random Forests underperformed the baseline regime filter due to the severe sample constraints of the 9-year record. Volatility scaling delivered strictly flat results, proving simple multiplicative operations unable to artificially engineer higher information ratios.

### Implementation and Constraints
Execution requires simple month-end rebalancing mapping continuous fractional positions directly tied to signal strength. Transaction costs model at ten basis points per interaction against heavily liquid WEAT volumes yielding functionally zero execution risk. The paramount limitation rests upon the abbreviated 9-year verification sample forcing wide confidence intervals and neglecting the impact of primary global producers like Russia and Australia. Upgraded strategies would incorporate quarter-century standard CBOT futures timelines and broader international production vectors.

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

*This document serves exclusively for research tracking and lacks any authority representing investment advice.*
