# 🖥️ KINDORA Server — Events API

Express 5 and MongoDB API for the KINDORA Social Development Events Platform.

🌐 **Live Website:** [KINDORA](https://kindora-encodeshohan.vercel.app/)
📦 **Backend Repository:** [encodeshohan/kindora-server](https://github.com/encodeshohan/kindora-server)
🎨 **Frontend Repository:** [encodeshohan/kindora](https://github.com/encodeshohan/kindora)

---

## 🌐 Project Overview

**KINDORA Server** is the REST API behind the KINDORA events platform. It stores events and join records, and it decides who is allowed to create, change or delete them.

The frontend signs users in with Better Auth and sends a JWT in the `Authorization: Bearer <token>` header. This server verifies that token against the frontend's public keys at `/api/auth/jwks`, so it never handles passwords or sessions itself.

---

## 🛠️ Technologies Used

### Backend

- 🟢 **Node.js** — ES modules runtime
- 🚂 **Express 5** — Routing and error handling for async handlers
- 🍃 **MongoDB** — Database for events and join records

### Libraries

- 🔐 **jose** — JWT verification using a remote JWKS
- 🌍 **cors** — Locks the API to the KINDORA frontend origin
- ⚙️ **dotenv** — Environment variable loading

### Hosting

- ▲ **Vercel** — Serverless deployment
- 🗄️ **MongoDB Atlas** — Hosted database

---

## ✨ Features

### 1. 🔐 Secure JWT Authentication

- Verifies tokens with the frontend's public keys (JWKS)
- Checks the token issuer and audience against `CLIENT_URL`
- Rejects missing, invalid and expired tokens with a clear 401 message

### 2. 📅 Smart Upcoming Events

- Returns only future events, sorted by date
- Search by title, and filter by type and location
- Safe, escaped search patterns, so user input can never act as a regex
- `limit` is clamped between 1 and 100

### 3. 🛠️ Event Management with Ownership Checks

- Create, update and delete events
- Only the creator can change or delete an event (403 otherwise)
- Creator name, email and photo are taken from the verified token, never from the request body
- Cascade delete removes an event's join records

### 4. ✅ Join and Leave Events

- Join an event, with a unique index that blocks double joins (409)
- Past events cannot be joined
- Leave an event, and check join status
- Joined events list sorted by event date
- Event detail response includes `joinedCount`
- Event updates are copied to every join record automatically

### 5. 🧪 Strict Input Validation

- Allowed fields only, and every value is trimmed
- Title 3 to 100 characters, description 10 to 2000 characters, location 2 to 150 characters
- Event type must be one of the seven allowed types
- Thumbnail must be a valid HTTPS URL
- Dates must be real `YYYY-MM-DD` dates and cannot be in the past
- Owners can still edit an old event without changing its date

### 6. 🛡️ Hardened Server Settings

- CORS limited to the frontend origin
- JSON body limit of 20 KB
- `x-powered-by` header disabled
- Consistent error shape: `{ "message": "..." }`
- Invalid JSON and oversized bodies return 400 and 413 instead of crashing

### 7. ⚡ Indexed Queries and Bangladesh Time

- Indexes for events by date, creator and date, and join records by user and date
- "Today" is always computed in Asia/Dhaka, so servers running in UTC cannot shift the day

---

## 🗃️ Data Collections

| Collection | Purpose |
|---|---|
| `events` | Event details plus creator name, email and photo |
| `joinedEvents` | One record per user per event, with a copy of the event details |

A unique index on `{ eventId, userEmail }` guarantees one join per user per event.

---

## 📡 API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Health check |
| GET | `/events` | Public | Future events sorted by date. Query: `search`, `type`, `location`, `limit` |
| GET | `/events/:id` | Public | One event, with `joinedCount` |
| POST | `/events` | Token | Create an event |
| PATCH | `/events/:id` | Token (owner) | Update an event |
| DELETE | `/events/:id` | Token (owner) | Delete an event and its join records |
| GET | `/my-events` | Token | Events created by the signed-in user |
| POST | `/events/:id/join` | Token | Join an event (409 if already joined) |
| DELETE | `/events/:id/join` | Token | Leave an event |
| GET | `/events/:id/join-status` | Token | Whether the signed-in user has joined |
| GET | `/joined-events` | Token | Joined events sorted by event date |

Errors use the shape `{ "message": "..." }` with status 400, 401, 403, 404, 409, 413 or 500.

### Event body example

```json
{
  "title": "Beach cleanup at the lake road",
  "description": "Bring gloves and a bag. We will collect plastic together.",
  "type": "Cleanup",
  "thumbnail": "https://example.com/photo.jpg",
  "location": "Dhaka",
  "date": "2026-12-20"
}
```

---

## 📂 Project Structure

```
kindora-server/
├── index.js        # Express app, validation, auth and all routes
├── package.json
├── vercel.json     # Vercel deployment config
└── README.md
```

---

## ⚙️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- npm
- A MongoDB database, such as a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- The [KINDORA frontend](https://github.com/encodeshohan/kindora) for signing users in

### 1. Clone the repository

```bash
git clone https://github.com/encodeshohan/kindora-server.git
cd kindora-server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
MONGODB_URI=your_mongodb_connection_string
DB_NAME=kindora
CLIENT_URL=http://localhost:3000
PORT=8000
```

| Name | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `DB_NAME` | Database name (defaults to `kindora`). Use a different name for production |
| `CLIENT_URL` | Deployed client origin, no trailing slash. Must match the client's `BETTER_AUTH_URL` |
| `PORT` | Local port (defaults to 8000, ignored on Vercel) |

**Important:** never commit your `.env` file or expose your secrets publicly.

### 4. Run the server

```bash
npm run dev
```

The API runs at <http://localhost:8000>.

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the server with auto-restart on changes |
| `npm start` | Start the server in production mode |

---

## 🚀 Deployment (Vercel)

1. Import the repository as a new Vercel project.
2. Add `MONGODB_URI`, `CLIENT_URL` and, if you use a custom name, `DB_NAME` in Project Settings > Environment Variables.
3. In MongoDB Atlas > Network Access, allow connections from Vercel. Vercel uses changing IP addresses, so `0.0.0.0/0` is needed.
4. Set `NEXT_PUBLIC_API_URL` on the client to this server's deployed URL.
5. Make sure `CLIENT_URL` matches the client's `BETTER_AUTH_URL` exactly, including `https://` and with no trailing slash.

---

## 📝 Notes

- Event dates are compared as `YYYY-MM-DD` strings in Bangladesh time (Asia/Dhaka). An event happening today still counts as upcoming.
- CORS allows only `CLIENT_URL`, so Vercel preview deployments on other URLs cannot call the API.

---

## 📌 Future Improvements

- 📄 Pagination for events, my events and joined events
- 🚦 Rate limiting on public routes
- 🆔 Use the user ID instead of email as the owner key
- 📈 Event attendance limits and waiting lists
- 🔎 Full-text search with a MongoDB text index
- 🧪 Automated API tests

---

## 👨‍💻 Author

**MD. SHOHANUR RAHMAN SHOHAN**

GitHub: [@encodeshohan](https://github.com/encodeshohan)

Built with ❤️ using Node.js, Express and MongoDB.