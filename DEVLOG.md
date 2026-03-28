# Entelechy Development Log

## Project and Code Content
Entelechy is an analytical dashboard and agricultural data engine built to evaluate crop yields and commodity signals, primarily focusing on wheat and almonds. The application combines a Python backend with a React frontend to deliver environmental awareness alongside algorithmic metrics.

The core Python services handle data processes including geospatial imagery extraction, article sentiment scoring, and quantitative algorithms. The backend utilizes specific APIs and models to maintain accurate representations of global agricultural conditions.

On the front end, a dynamic control center provides visual access to these data streams. Built with React and TypeScript, the dashboard manages component state to transition between commodities and render rich visual elements like 3D globes and interactive graphs.

## Implementation Details
The backend relies on the Sentinel Hub Process API to request and calculate Normalized Difference Vegetation Index timeseries for targeted farm regions. This module retrieves satellite images and computes health metrics across the current seasonal cycle. Simultaneously, the news service polls recent commodity headlines and feeds them into a FinBERT sequence classification model. The model computes softmax probabilities to score every article on a continuous scale, translating global events into explicit positive or negative market indicators.

The React frontend presents this information natively. The interface centers around a 3D globe component mapped to critical agricultural coordinates. Clicking any mapped region queries the Open-Meteo API to surface granular live weather information covering localized temperature, humidity, wind speed, and cloud cover. An adjacent news panel displays live scrolling headlines connected to the active commodity query, organizing the sentiment pipeline outputs.

[SPACE FOR SENTIMENT ANALYSIS IMAGE]

[SPACE FOR NEWS FEED IMAGE]

[SPACE FOR TEMPERATURE AND HUMIDITY INFORMATION IMAGE]

[SPACE FOR FIELDS CROPPED SATELLITES IMAGES]

## Evaluation and Backtesting
The evaluation engine runs a backtest module that iterates over historical seasons without lookahead bias. The algorithm evaluates composite signals built from vegetation anomalies and news sentiment, generating trading decisions when the aggregated strength crosses defined thresholds. Simulated portfolios run volatility-adjusted position sizing and compute performance benchmarks including the Sharpe ratio, maximum drawdown, and trade win rates.

[PLACEHOLDER: Insert completed historical performance details, strategy robustness metrics, and baseline comparisons here.]

Initial testing rounds establish a baseline across historical data. Future evaluations will capture real-world slippage and document explicit hit rates across varying economic boundaries.
