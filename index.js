
import express from "express";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = process.env.PORT ?? 8000;

if (!process.env.MONGODB_URI || !process.env.CLIENT_URL) {
    throw new Error("Missing MONGODB_URI or CLIENT_URL in environment variables");
}

// Remove any trailing slash so CORS, the JWKS URL and the token checks all use the same value.
const CLIENT_URL = process.env.CLIENT_URL.replace(/\/+$/, "");

const client = new MongoClient(process.env.MONGODB_URI);

async function connectToMongoDB() {
    try {
        await client.connect();
        return client;
    } catch (err) {
        console.error("MongoDB connection failed:", err.message);
        throw err;
    }
}

app.disable("x-powered-by");
app.use(
    cors({
        origin: CLIENT_URL,
        methods: ["GET", "POST", "PATCH", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
        maxAge: 86400,
    }),
);
app.use(express.json({ limit: "20kb" }));

const mongoClient = await connectToMongoDB();
const db = mongoClient.db(process.env.DB_NAME ?? "kindora");
const eventsCollection = db.collection("events");
const joinedEventsCollection = db.collection("joinedEvents");


await joinedEventsCollection.createIndex(
    { eventId: 1, userEmail: 1 },
    { unique: true },
);

await eventsCollection.createIndex({ date: 1, _id: 1 });
await eventsCollection.createIndex({ creatorEmail: 1, date: 1 });
await joinedEventsCollection.createIndex({ userEmail: 1, date: 1 });

const JWKS = createRemoteJWKSet(new URL(`${CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).send({ message: "Unauthorized: missing token" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: CLIENT_URL,
            audience: CLIENT_URL,
        });

        if (!payload.email) {
            return res.status(401).send({ message: "Unauthorized: invalid token" });
        }

        req.user = payload;
        next();
    } catch (err) {
        console.error("JWT verification failed:", err.code ?? err.message);
        return res
            .status(401)
            .send({ message: "Unauthorized: invalid or expired token" });
    }
};

// ===== S3 HELPERS =====

const EVENT_TYPES = [
    "Cleanup",
    "Plantation",
    "Donation",
    "Education",
    "Health Camp",
    "Awareness",
    "Food Drive",
];

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

// "Today" is always computed in Bangladesh time, so Vercel (UTC) can't shift the day.
const getToday = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(
        new Date(),
    );

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isValidDateString = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
    );
};

const isHttpsUrl = (value) => {
    try {
        return new URL(value).protocol === "https:";
    } catch {
        return false;
    }
};

// Returns { data } with only the allowed fields, or { error }.
// currentDate lets an owner edit an old event without changing its date.
const validateEventBody = (body, currentDate) => {
    const text = (value) => (typeof value === "string" ? value.trim() : "");
    const data = {
        title: text(body.title),
        description: text(body.description),
        type: text(body.type),
        thumbnail: text(body.thumbnail),
        location: text(body.location),
        date: text(body.date),
    };

    if (data.title.length < 3 || data.title.length > 100) {
        return { error: "Title must be between 3 and 100 characters" };
    }
    if (data.description.length < 10 || data.description.length > 2000) {
        return { error: "Description must be between 10 and 2000 characters" };
    }
    if (!EVENT_TYPES.includes(data.type)) {
        return { error: "Invalid event type" };
    }
    if (data.thumbnail.length > 2048 || !isHttpsUrl(data.thumbnail)) {
        return { error: "Thumbnail must be a valid https URL" };
    }
    if (data.location.length < 2 || data.location.length > 150) {
        return { error: "Location must be between 2 and 150 characters" };
    }
    if (!isValidDateString(data.date)) {
        return { error: "Date must be a valid date in YYYY-MM-DD format" };
    }
    if (data.date !== currentDate && data.date < getToday()) {
        return { error: "Event date cannot be in the past" };
    }

    return { data };
};

// Loads the event and checks ownership. Sends 400/404/403 itself and returns null on failure.
const loadOwnedEvent = async (req, res) => {
    const { id } = req.params;
    if (!OBJECT_ID_PATTERN.test(id)) {
        res.status(400).send({ message: "Invalid event id" });
        return null;
    }
    const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
    if (!event) {
        res.status(404).send({ message: "Event not found" });
        return null;
    }
    if (event.creatorEmail !== req.user.email) {
        res
            .status(403)
            .send({ message: "Forbidden: you can only modify your own events" });
        return null;
    }
    return event;
};

// ===== EXISTING ROUTES =====

app.get("/", (req, res) => {
    res.send({ message: "Kindora Express Server is running!" });
});


// ===== S3 EVENT ROUTES =====

app.post("/events", verifyToken, async (req, res) => {
    const { data, error } = validateEventBody(req.body ?? {});
    if (error) {
        return res.status(400).send({ message: error });
    }

    const event = {
        ...data,
        creatorEmail: req.user.email,
        creatorName: req.user.name ?? "",
        creatorPhoto: req.user.image ?? "",
        createdAt: new Date().toISOString(),
    };
    const result = await eventsCollection.insertOne(event);
    res
        .status(201)
        .send({ message: "Event created successfully", insertedId: result.insertedId });
});

app.get("/events", async (req, res) => {
    const { search, type, location, limit } = req.query;
    const query = { date: { $gte: getToday() } };

    if (typeof search === "string" && search.trim()) {
        query.title = { $regex: escapeRegex(search.trim()), $options: "i" };
    }
    if (typeof type === "string" && type.trim()) {
        if (!EVENT_TYPES.includes(type)) {
            return res.status(400).send({ message: "Invalid event type" });
        }
        query.type = type;
    }
    if (typeof location === "string" && location.trim()) {
        query.location = { $regex: escapeRegex(location.trim()), $options: "i" };
    }

    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit = Number.isNaN(parsedLimit)
        ? 100
        : Math.min(Math.max(parsedLimit, 1), 100);

    const result = await eventsCollection
        .find(query)
        .sort({ date: 1, _id: 1 })
        .limit(safeLimit)
        .toArray();
    res.send(result);
});

app.get("/my-events", verifyToken, async (req, res) => {
    const result = await eventsCollection
        .find({ creatorEmail: req.user.email })
        .sort({ date: 1, _id: 1 })
        .toArray();
    res.send(result);
});

app.get("/events/:id", async (req, res) => {
    const { id } = req.params;
    if (!OBJECT_ID_PATTERN.test(id)) {
        return res.status(400).send({ message: "Invalid event id" });
    }
    const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
    if (!event) {
        return res.status(404).send({ message: "Event not found" });
    }
    res.send(event);
});

app.patch("/events/:id", verifyToken, async (req, res) => {
    const event = await loadOwnedEvent(req, res);
    if (!event) return;

    const { data, error } = validateEventBody(req.body ?? {}, event.date);
    if (error) {
        return res.status(400).send({ message: error });
    }

    await eventsCollection.updateOne(
        { _id: event._id },
        { $set: { ...data, updatedAt: new Date().toISOString() } },
    );
    await joinedEventsCollection.updateMany(
        { eventId: event._id },
        {
            $set: {
                title: data.title,
                type: data.type,
                thumbnail: data.thumbnail,
                location: data.location,
                date: data.date,
            },
        },
    );
    res.send({ message: "Event updated successfully" });
});

app.delete("/events/:id", verifyToken, async (req, res) => {
    const event = await loadOwnedEvent(req, res);
    if (!event) return;

    await eventsCollection.deleteOne({ _id: event._id });
    await joinedEventsCollection.deleteMany({ eventId: event._id });
    res.send({ message: "Event deleted successfully" });
});

app.post("/events/:id/join", verifyToken, async (req, res) => {
    const { id } = req.params;
    if (!OBJECT_ID_PATTERN.test(id)) {
        return res.status(400).send({ message: "Invalid event id" });
    }

    const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
    if (!event) {
        return res.status(404).send({ message: "Event not found" });
    }
    if (event.date < getToday()) {
        return res
            .status(400)
            .send({ message: "This event has already taken place" });
    }

    const joinedEvent = {
        eventId: event._id,
        title: event.title,
        type: event.type,
        thumbnail: event.thumbnail,
        location: event.location,
        date: event.date,
        userEmail: req.user.email,
        userName: req.user.name ?? "",
        userPhoto: req.user.image ?? "",
        joinedAt: new Date().toISOString(),
    };

    try {
        await joinedEventsCollection.insertOne(joinedEvent);
    } catch (err) {
        if (err.code === 11000) {
            return res
                .status(409)
                .send({ message: "You have already joined this event" });
        }
        throw err;
    }
    res.status(201).send({ message: "Joined event successfully" });
});

app.get("/events/:id/join-status", verifyToken, async (req, res) => {
    const { id } = req.params;
    if (!OBJECT_ID_PATTERN.test(id)) {
        return res.status(400).send({ message: "Invalid event id" });
    }
    const joined = await joinedEventsCollection.findOne({
        eventId: new ObjectId(id),
        userEmail: req.user.email,
    });
    res.send({ joined: Boolean(joined) });
});

app.delete("/events/:id/join", verifyToken, async (req, res) => {
    const { id } = req.params;
    if (!OBJECT_ID_PATTERN.test(id)) {
        return res.status(400).send({ message: "Invalid event id" });
    }
    const result = await joinedEventsCollection.deleteOne({
        eventId: new ObjectId(id),
        userEmail: req.user.email,
    });
    if (result.deletedCount === 0) {
        return res
            .status(404)
            .send({ message: "You have not joined this event" });
    }
    res.send({ message: "You have left the event" });
});

app.get("/joined-events", verifyToken, async (req, res) => {
    const result = await joinedEventsCollection
        .find({ userEmail: req.user.email })
        .sort({ date: 1, joinedAt: 1 })
        .toArray();
    res.send(result);
});

// ===== ROUTES GO ABOVE THIS LINE (added in S2-S4) =====

app.use((req, res) => {
    res.status(404).send({ message: "Route not found" });
});

app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res.status(400).send({ message: "Invalid JSON body" });
    }
    if (err.type === "entity.too.large") {
        return res.status(413).send({ message: "Request body is too large" });
    }
    console.error(err);
    res.status(500).send({ message: "Internal server error" });
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running at ${PORT}`);
    });
}

export default app;
