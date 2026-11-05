# Kindora Server

Express 5 + MongoDB API for the KINDORA Social Development Events Platform.
The client app signs users in with Better Auth and sends a JWT in the
`Authorization: Bearer <token>` header. This server verifies that token with
the client's public keys (`/api/auth/jwks`).

## Setup

1. Copy `.env.example` to `.env` and fill in the values.
2. Install dependencies: `npm install`
3. Start in development: `npm run dev`
4. Start in production: `npm start`

## Environment variables

| Name | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `DB_NAME` | Database name (defaults to `kindora`). Use a different name for production |
| `CLIENT_URL` | Deployed client origin, e.g. `https://your-client.vercel.app` (no trailing slash). Must match the client's `BETTER_AUTH_URL` |
| `PORT` | Local port (defaults to 8000, ignored on Vercel) |

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/events` | Public | Future events sorted by date. Query: `search`, `type`, `location`, `limit` |
| GET | `/events/:id` | Public | One event |
| POST | `/events` | Token | Create an event |
| PATCH | `/events/:id` | Token (owner) | Update an event |
| DELETE | `/events/:id` | Token (owner) | Delete an event and its join records |
| GET | `/my-events` | Token | Events created by the signed-in user |
| POST | `/events/:id/join` | Token | Join an event (409 if already joined) |
| DELETE | `/events/:id/join` | Token | Leave an event |
| GET | `/events/:id/join-status` | Token | Whether the signed-in user has joined |
| GET | `/joined-events` | Token | Joined events sorted by event date |

Errors use the shape `{ "message": "..." }` with status 400, 401, 403, 404, 409, 413 or 500.

## Deployment (Vercel)

1. Import the repository as a new Vercel project (it is detected as Express; `index.js` default-exports the app).
2. Add `MONGODB_URI` and `CLIENT_URL` in Project Settings > Environment Variables.
3. In MongoDB Atlas > Network Access, allow connections from Vercel (Vercel uses changing IP addresses, so `0.0.0.0/0` is needed).
4. Set `NEXT_PUBLIC_API_URL` on the client to this server's deployed URL.