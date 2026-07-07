# BondStats AI

BondStats AI is a focused financial intelligence chat interface for structured questions about:

- Financial markets
- Bonds and fixed income
- Monetary policy
- Central banks
- Inflation
- Macroeconomics
- Financial risk
- Market mechanisms

## Product Focus

BondStats AI is intentionally simple.

The application focuses on one primary workflow:

> Ask a financial question and receive a structured analytical response.

The response architecture separates:

1. Direct answer
2. Why it matters
3. Mechanism
4. Countercase
5. Confidence
6. What could change the view

## Architecture

```text
bondstats-ai/
├── package.json
├── .gitignore
├── README.md
│
├── server/
│   └── server.js
│
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Requirements

- Node.js 18 or newer
- npm

## Installation

Install dependencies:

```bash
npm install
```

## Development

Start the application:

```bash
npm run dev
```

The default local port is:

```text
3000
```

## Health Check

The server provides:

```text
GET /api/health
```

Expected response structure:

```json
{
  "ok": true,
  "service": "BondStats AI",
  "time": "ISO_TIMESTAMP"
}
```

## Chat API

The financial chat endpoint is:

```text
POST /api/chat
```

Example request body:

```json
{
  "message": "How does inflation affect bond prices?"
}
```

## Current Intelligence Engine

Version 1.0 uses a deterministic local financial reasoning engine.

This allows reliable testing of:

- User input
- Send button
- Enter-to-send
- Shift+Enter line breaks
- API communication
- Loading state
- Error state
- Health status
- Structured response rendering
- Responsive interface behavior

## Security Principles

- No API keys in browser JavaScript
- No secrets committed to Git
- Server-side AI integration only
- Input length limits
- Safe text rendering
- No invented source citations
- Clear uncertainty language
- Educational financial information only

## Important Limitation

The current local engine is not a general-purpose AI model.

A production AI provider can later be connected through the server layer without exposing private API credentials in frontend code.

## Disclaimer

BondStats AI provides educational financial information and analytical frameworks.

It does not provide individualized investment advice, legal advice, tax advice, or guaranteed predictions.
