# MairaFX Application Overview

This document provides a comprehensive, section-by-section breakdown of the entire MairaFX application. The dashboard is divided into three primary tabs: **Chart**, **Analysis**, and **Backtest**.

> [!NOTE]
> All modules in the application dynamically react to the globally selected Currency Pair (e.g., EUR/USD) and Timeframe (e.g., 15m, 1H) controlled via the top navigation bar.

---

## 1. Chart Tab (The Execution View)

The Chart tab is the primary interface for active market monitoring and immediate trade execution decisions.

### 📈 Lightweight Chart (`Chart.tsx`)
A high-performance interactive candlestick chart powered by TradingView's Lightweight Charts library. It visualizes the raw price action for the selected pair and timeframe, serving as the visual anchor for all AI analysis.

### 🧠 AI Verdict Panel (`AiVerdictPanel.tsx`)
This is the core "Brain" of the application. It takes the aggregated data from all underlying systems and uses an LLM (Gemini) to synthesize a final trading decision.
- **Verdict & Confidence**: Outputs a definitive `LONG`, `SHORT`, or `WAIT` verdict alongside a confidence score (0-100).
- **Mode Toggle**: Allows users to switch between `Strict` (requires pristine setups) and `Aggressive` (takes riskier setups).
- **Structured Reads**: Breaks down the AI's logic into specific paragraphs:
  - **Market Structure**: Trend state and key pivot points.
  - **Liquidity Context**: Resting liquidity pools and sweeps.
  - **Confluence Check**: How technical indicators align with the structure.
  - **Thesis & Weakest Point**: The core directional argument and its biggest vulnerability.
- **Actionable Levels**: Explicitly states numerical `Target` and `Invalidation` (Stop Loss) prices.

---

## 2. Analysis Tab (The Data Engine)

The Analysis tab is a dense, quantitative dashboard that exposes the raw data and intermediate calculations the AI uses to formulate its final verdict.

### 🛣️ Rule-Based Lanes (`LanePanel.tsx`)
Breaks the market down into four distinct, rule-based computational "Lanes". Each lane returns a directional bias (`bull`, `bear`, or `mixed`) and a confidence tier (`high`, `moderate`, `low`).
1. **Technical**: EMA vectors, RSI momentum, and Bollinger Band positioning.
2. **Flow**: Institutional order flow and positioning.
3. **Narrative**: The overarching market story (e.g., risk-on vs risk-off).
4. **Macro**: Fundamental economic health.

### 🏛️ Institutional COT (`CotBadge.tsx`)
Displays Commitment of Traders (COT) data from the CFTC.
- Shows whether large institutions/hedge funds are **Net Long** or **Net Short**.
- Calculates a **Z-Score** to detect statistical extremes, alerting you when institutions are dangerously over-leveraged in one direction (a potential reversal signal).

### 🌡️ Currency Strength Heatmap (`CurrencyHeatmap.tsx`)
A relative strength visualizer evaluating individual currencies (EUR, USD, JPY, GBP, etc.) against a basket of peers over a 24-hour window. Helps identify the absolute strongest and weakest currencies to pair together.

### 👥 Retail Sentiment (`RetailSentiment.tsx`)
Displays IG Client Sentiment data, showing the percentage of retail traders who are Long vs. Short. This acts as a powerful contrarian indicator (if 85% of retail is Long, the institutional move is likely Short).

### 📊 Volatility Monitor (`VolatilityMonitor.tsx`)
Compares the current Average True Range (ATR) against a 20-period historical average.
- **Expansion**: Indicates price is moving violently (good for breakout strategies).
- **Compression**: Indicates price is coiling (good for range-bound strategies or anticipating an explosive breakout).

### 🕒 Session Visualizer (`SessionVisualizer.tsx`)
A visual timeline graphic tracking global market hours (Sydney, Tokyo, London, New York). It maps the current UTC time against these sessions to highlight "Killzones" where liquidity and volatility peak due to overlapping market hours.

### 📅 Economic Calendar (`EconomicCalendar.tsx`)
A feed of upcoming macroeconomic news events (e.g., NFP, CPI) complete with expected impact levels, preventing you from getting caught in unpredictable fundamental volatility spikes.

### 📰 Key Drivers (`KeyDriversPanel.tsx`)
A news feed component that pulls the latest fundamental headlines directly relevant to the selected currency pair, providing qualitative context to quantitative moves.

---

## 3. Backtest Tab (The Validation Engine)

The Backtest tab is the quantitative validation suite. It tracks the historical accuracy of the AI and manages the offline data lake.

### 🏆 AI Performance Ledger (`BacktestPanel.tsx`)
A statistical dashboard that continuously scores the AI's past predictions by checking them against actual subsequent price action.
- **Win Rate by Conviction**: Proves whether higher AI confidence scores actually correlate with higher win rates.
- **Win Rate by Pair**: Identifies which currency pairs the AI is most profitable on.
- **WAIT Accuracy**: Tracks how many times the AI correctly told you to stay out of the market to avoid choppy, untradeable price action.
- **Confluence Edge**: Calculates the specific win rate of individual trading concepts (e.g., "Does trading with Liquidity Sweeps have a higher win rate than trading pure Market Structure?").
- **Recent Ledger**: A scrolling table of the 50 most recent verdicts, their targets, and their final resolved outcomes (WIN/LOSS/TIMEOUT).

### 🗄️ Data Lake Pipeline (`BacktestPanel.tsx`)
Manages the massive historical candlestick database used for offline quantitative testing.
- **Status Monitor**: Displays the total number of OHLCV candles stored per pair, with earliest and latest timestamps.
- **Massive Backfill Engine**: A one-click trigger that paginates backward through the OANDA API to download up to 3 years of historical 15m/1H/4H candles into the PostgreSQL database.
- **CSV Export**: Allows quants to dump the entire curated data lake into a `.csv` file for external mechanical testing in Python or Pandas.

---

## 4. Algorithmic Strategies & API Architecture

This section outlines the exact quantitative strategies, algorithms, and third-party APIs powering the MairaFX engine under the hood.

### 4.1 Third-Party API Integrations

The engine relies on a multi-sourced data pipeline to ensure robustness and high-fidelity data.

*   **OANDA REST API**: Used heavily for the offline Data Lake. It paginates backward to fetch massive historical OHLCV datasets (up to 5,000 candles per call) for backtesting.
*   **Finnhub API**: 
    *   *WebSocket*: Used for live tick-by-tick price data to keep the active chart and indicators updating in real-time without polling.
    *   *REST*: Used to fetch the latest global forex headlines to power the Narrative Lane.
*   **Yahoo Finance API (`yahoo-finance2`)**: Used by the Macro Lane to fetch real-time quotes for the **DXY** (US Dollar Index) and **^GSPC** (S&P 500). Also acts as a fallback for backfilling historical candles if OANDA is rate-limited.
*   **CFTC COT Data**: (Internal scraper/fetcher) Pulls the weekly Commitment of Traders report to analyze institutional hedge fund positioning.

### 4.2 Quantitative Strategies (The 4 Lanes)

The engine evaluates the market across four distinct computational "Lanes". Each lane calculates a numerical score; these scores are aggregated to form the final AI verdict.

#### 📈 Technical Lane
*   **EMA Vector Math**: Evaluates the stack (9, 21, 50, 200 EMAs). It calculates the percentage spread between the 9 and 50 EMA. If the spread is `< 0.05%`, it flags a "Ranging Market". If stacked in order (9 > 21 > 50 > 200), it flags a "Strong Trend".
*   **RSI Regime Logic**: 
    *   *In a Range* (ADX < 25): Fades the extremes. RSI > 70 generates a short signal (Mean Reversion).
    *   *In a Trend* (ADX > 25): Rides the momentum. RSI > 70 generates a long signal (Trend Continuation).
*   **Overextension**: Measures distance from the 200 EMA. If price deviates > `0.5%`, it flags an overextension risk.
*   **Session Multipliers**: Detects ICT "Kill Zones" (London Open 06:00-09:00 UTC, NY Open 12:00-15:00 UTC). If an active setup occurs inside a kill zone, the technical score receives a `1.1x` multiplier.

#### 🌊 Flow Lane
*   **Carry Trade Calculation**: Pulls live central bank interest rates for the base and quote currency. It calculates the `Base Rate - Quote Rate` differential. 
    *   *Example*: If USD rate is 5.5% and JPY rate is 0.1%, the differential is `+5.4%`. A differential `> 1.0%` adds massive bullish points due to positive institutional carry.
*   **COT Momentum**: Reads institutional net-long/short percentages. If institutions are > `40%` net long open interest, it heavily biases the Flow Lane bullish.

#### 🌍 Macro Lane
*   **DXY (Dollar Index) Correlation**: Polls Yahoo Finance for DXY change percentage. If DXY moves > `0.3%`, it dynamically applies tailwinds/headwinds. 
*   **Risk-On / Risk-Off (SPX)**: Evaluates the S&P 500 daily change.
    *   *Risk-On (SPX Positive)*: Favors risk assets like AUD, EUR, GBP.
    *   *Risk-Off (SPX Negative)*: Favors safe havens, specifically adding bullish weight to JPY (driving `USD_JPY` down).

#### 📰 Narrative Lane
*   **Algorithmic Sentiment Analysis**: Fetches recent headlines from Finnhub.
*   **Keyword Extraction**: Maps headlines to currencies (e.g., "FOMC" -> USD, "Lagarde" -> EUR).
*   **Directional Scoring**: Cross-references against a proprietary dictionary of Bullish/Bearish words.
*   **Relative Impact**: If a headline is "FOMC announces unexpected rate hike" (USD Bullish), it automatically assigns a *bearish* score to `EUR_USD` and a *bullish* score to `USD_JPY`.

### 4.3 Smart Money Concepts (SMC) Detector

Located in the core detector engine, this algorithm mathematically identifies advanced price action concepts without traditional indicators.

*   **Swing Pivot Detection**: Loops through historical candles to find local maximums/minimums over a 5-candle rolling window to establish high/low fractals.
*   **Market Structure (BOS & CHoCH)**: Tracks sequences of Higher Highs (HH) vs Lower Lows (LL). If price closes past the most recent swing pivot, it flags a **Break of Structure (BOS)**. If the BOS occurs *against* the prevailing trend, it flags a **Change of Character (CHoCH)**.
*   **Premium / Discount Zones**: Finds the midpoint between the recent highest high and lowest low. Above the midpoint is "Premium" (look for shorts); below is "Discount" (look for longs).
*   **Liquidity Clusters**: Takes all historical swing pivots and runs a clustering algorithm (0.1% tolerance) to find areas where price has touched multiple times. High-touch clusters are flagged as strong **Resting Liquidity Pools** (magnets for price).
