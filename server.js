import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { Groq } from "groq-sdk";

const app = express();
const PORT = process.env.PORT || 3000;

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "5mb" }));

// Serve frontend files (index.html, style.css, app.js) directly from root
app.use(express.static(process.cwd()));

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

app.get("/health", (req, res) => res.json({ ok: true }));

// Chat model
const chatSchema = new mongoose.Schema({
  userId: String,
  prompt: String,
  response: String,
  createdAt: { type: Date, default: Date.now }
});
const Chat = mongoose.model("Chat", chatSchema);

// Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callGroqAI(prompt, attachments = []) {
  // ... (same as before — maine pehle diya tha)
  // model: "llama-3.3-70b-versatile"  ← yeh hi best hai
}

app.post("/ai", async (req, res) => {
  // ... (same as before)
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Codez AI running on port ${PORT}`);
});
