import "dotenv/config";
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import session from "express-session";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";
import path from "path";
import fs from "fs";
import { simpleGit } from "simple-git";
import * as cheerio from "cheerio";
import { Groq } from "groq-sdk";

const app = express();
const PORT = process.env.PORT || 3000;
const REPOS_DIR = path.join(process.cwd(), "repos");

if (!fs.existsSync(REPOS_DIR)) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
}

// ← Logging for debug
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Body:`, req.body);
  next();
});

app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "5mb" }));
app.set("trust proxy", 1);
app.use(express.static(process.cwd()));

app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "";
if (mongoUri) {
  mongoose.connect(mongoUri)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error("MongoDB connection failed", err));
}

// ← Chat model define kar diya (yeh missing tha!)
const chatSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  prompt: { type: String, required: true },
  response: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callGroqAI(prompt, attachments = []) {
  let fullPrompt = prompt;

  if (attachments && attachments.length > 0) {
    fullPrompt += "\n\n=== Attached Files/Context ===\n";
    attachments.forEach(att => {
      fullPrompt += `\n--- File: ${att.name} ---\n${att.content.substring(0, 8000)}\n`;
    });
    fullPrompt += "\nUse the above files/context to answer accurately.";
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are Codez AI — expert coding assistant jaise OpenAI Codex. Hindi-English mix mein jawab dena (jaise user baat karta hai). Code generate karo, explain karo, debug karo, optimize karo. Clean code with comments do, step-by-step socho aur batao. Kabhi galat ya outdated code mat dena."
        },
        { role: "user", content: fullPrompt }
      ],
      model: "llama-3.3-70b-versatile",  // Yeh abhi active hai (March 2026)
      temperature: 0.35,
      max_tokens: 4096,
      top_p: 0.92
    });

    return {
      ok: true,
      result: completion.choices[0]?.message?.content || "No response from AI"
    };
  } catch (err) {
    console.error("Groq AI error:", err);
    return { ok: false, error: err.message || "AI request failed" };
  }
}

app.post("/ai", async (req, res) => {
  const { prompt, attachments } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "No prompt provided" });
  }

  const aiResponse = await callGroqAI(prompt, attachments);

  if (!aiResponse.ok) {
    return res.json({ result: `AI error: ${aiResponse.error}` });
  }

  if (req.user) {
    await Chat.create({
      userId: req.user.id,
      prompt,
      response: aiResponse.result
    });
  }

  res.json({ result: aiResponse.result });
});

// ← 404 aur error handlers
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Codez AI running on port ${PORT}`);
});
