import express from "express";
import "dotenv/config";
import { MongoClient } from "mongodb";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = process.env.PORT ?? 8000;

if (!process.env.MONGODB_URI || !process.env.CLIENT_URL) {
    throw new Error("Missing MONGODB_URI or CLIENT_URL in environment variables");
}

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

app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("kindora");
const eventsCollection = db.collection("events");
const joinedEventsCollection = db.collection("joinedEvents");


const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).send({ message: "Unauthorized: missing token" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: process.env.CLIENT_URL,
            audience: process.env.CLIENT_URL,
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

app.get("/", (req, res) => {
    res.send({ message: "Kindora Express Server is running!" });
});

// ===== ROUTES GO ABOVE THIS LINE (added in S2-S4) =====

app.get("/me", verifyToken, (req, res) => {
    res.send({ email: req.user.email, name: req.user.name });
});

app.use((req, res) => {
    res.status(404).send({ message: "Route not found" });
});

app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res.status(400).send({ message: "Invalid JSON body" });
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