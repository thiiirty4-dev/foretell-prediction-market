# Foretell Prediction Markets

A public prediction-market simulation built as a portfolio project. Foretell combines a dense trading-workstation interface with durable market and trade data.

**Live demo:** https://foretell-markets.foretell-labs.workers.dev

## What it demonstrates

- Public prediction-market discovery and search
- YES / NO probability pricing
- Simulated order execution with price impact
- Persistent market creation and trade history
- Responsive desktop and mobile layouts
- Server-side input validation and bounded demo orders
- Share-ready Open Graph metadata

## Tech stack

- Next.js-compatible App Router via Vinext
- React and TypeScript
- Cloudflare Workers
- Cloudflare D1 / SQLite
- Drizzle schema and migrations
- Tailwind CSS build pipeline

## Data model

The database contains two core tables:

- `markets`: question, resolution criteria, category, close time, probability, volume, liquidity and status
- `trades`: market reference, outcome, simulated amount, shares, execution price and timestamp

The application creates the schema safely on first access and ships a Drizzle migration for hosted environments.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Generate a migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

Create a production build:

```bash
npm run build
```

## Important scope

Foretell is a technical demonstration. Trading, balances, prices and payouts are simulations with no real money or financial value. It is not investment advice and does not connect to a blockchain or execute real transactions.
