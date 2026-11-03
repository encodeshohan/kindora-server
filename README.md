# Kindora Server

Express 5 + MongoDB API for the KINDORA Social Development Events Platform.

## Setup

1. Copy `.env.example` to `.env` and fill in the values.
2. Install dependencies: `npm install`
3. Start in development: `npm run dev`
4. Start in production: `npm start`

## Environment variables

| Name | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `CLIENT_URL` | Deployed client origin, with no trailing slash (also used for the JWKS URL) |
| `PORT` | Local port (defaults to 8000, ignored on Vercel) |

## Deployment

Deployed on Vercel. The app default-exports from `index.js`, so no extra config is needed.