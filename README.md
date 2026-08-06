# Forex.AI - AI-Powered Forex Market Dashboard

A single-user, self-hosted forex market analysis dashboard built for the free tier.

This dashboard streams live pricing from OANDA, renders TradingView lightweight charts with technical overlays (EMA/RSI/Bollinger Bands/ATR), detects support/resistance zones, and runs four rule-based analysis lanes (Technical, Flow, Narrative, Macro) to score the market state. Optionally, it synthesizes these lanes into an AI-narrated trading verdict using the Google Gemini free tier.

## Features

- **Live Data**: Streams from OANDA demo accounts.
- **Rule-Based Analysis**: Four deterministically scored lanes running constantly.
- **LLM Narrative (Optional)**: Click-to-analyze to get an AI summary of the current market structure (powered by Gemini Flash, heavily grounded in numerical data).
- **Zone Detection**: Auto-detects support, resistance, order blocks, and golden pockets.
- **Alerts**: Price action alerts delivered to the UI and Telegram.

## Setup & Local Run

### Prerequisites
- Node.js 18+
- PostgreSQL (or use the provided `docker-compose.yml`)

### 1. Database Setup
If you don't have a hosted Postgres instance (like Supabase or Neon), you can run a local one:
```bash
docker compose up -d
```

### 2. Backend Configuration
Navigate to the `backend` folder:
```bash
cd backend
npm install
```
Copy `.env.example` to `.env` and fill in the required keys:
- `OANDA_API_KEY` & `OANDA_ACCOUNT_ID`: Get a free demo account at [developer.oanda.com](https://developer.oanda.com/).
- `DATABASE_URL`: `postgres://user:password@localhost:5432/dbname` (if using local docker).
- `GEMINI_API_KEY` (Optional): Get a free key at [Google AI Studio](https://aistudio.google.com/) for the click-to-analyze feature.
- `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID` (Optional): For alerts.

Start the backend:
```bash
node src/index.js
```

### 3. Frontend Configuration
Navigate to the `frontend` folder:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

## Deployment (Free Tier)

This stack is designed to fit entirely on free tiers.

- **Frontend**: Deploy the `frontend` directory to **Vercel** or **Netlify**. Ensure the build command is `npm run build` and output directory is `dist`. Set the proxy/API url in `vite.config.ts` or via environment variables to point to your backend.
- **Backend**: Deploy the `backend` directory to **Render** or **Railway**. Use the command `node src/index.js`.
- **Database**: Use a free managed Postgres database from **Supabase** or **Neon**.

### Upgrades
- *OANDA*: Swap the demo URLs/keys for a live account.
- *LLM*: Swap the Gemini free tier for Claude Haiku or GPT-4o-mini if you need stronger instruction following and are willing to pay per API call. Modify `synth.js` to point to Anthropic/OpenAI SDKs.
