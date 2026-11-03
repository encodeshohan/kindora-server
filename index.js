import express from 'express'
import 'dotenv/config'
import { MongoClient } from 'mongodb'
import cors from 'cors'

const app = express();
const PORT = 8000;

// http://localhost:8000/

const client = new MongoClient(process.env.MONGODB_URI)

export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("MongoDB connected successfully!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}

app.get("/", (req, res) => {
    res.send({ message: "Kindora Express Server is running!" });
});

app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}`)
})

connectToMongoDB();
