app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html'));
});


import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";
import path from "path";
import fs from "fs";
import { Groq } from "groq-sdk";

const app = express();
const PORT = process.env.PORT || 3000;
const REPOS_DIR = path.join(process.cwd(), "repos");

if (!fs.existsSync(REPOS_DIR)) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
}

// Request logging (debug ke liye bahut helpful)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log("Body:", req.body);
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
app.use(express.static(path.join(process.cwd(), "public"))); 

app.get("/", (req, res) => res.send("Codez AI backend running"));
app.get("/health", (req, res) => res.json({ ok: true, time: new Date() }));

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "";
if (mongoUri) {
  mongoose.connect(mongoUri)
    .then(() => console.log("MongoDB connected successfully"))
    .catch(err => console.error("MongoDB connection error:", err));
}

// Chat Schema (yeh missing tha pehle – ab add kar diya)
const chatSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  prompt: { type: String, required: true },
  response: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Chat = mongoose.model("Chat", chatSchema);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callGroqAI(prompt, attachments = []) {
  let fullPrompt = prompt;

  if (attachments?.length > 0) {
    fullPrompt += "\n\n=== Attached Files/Context ===\n";
    attachments.forEach(att => {
      fullPrompt += `\n--- File: ${att.name} ---\n${att.content.substring(0, 7000)}\n`;
    });
    fullPrompt += "\nInke basis pe sahi aur accurate jawab dena.";
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are Codez AI – expert coding assistant jaise OpenAI Codex tha. Hindi-English mix mein jawab dena (jaise user baat karta hai). Code generate karo, explain karo, debug karo, optimize karo, refactor karo. Hamesha clean, commented code do. Step-by-step soch ke jawab dena. Galat ya outdated code bilkul mat dena."
        },
        { role: "user", content: fullPrompt }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.35,
      max_tokens: 4096,
      top_p: 0.92
    });

    return {
      ok: true,
      result: completion.choices[0]?.message?.content || "No response from AI"
    };
  } catch (err) {
    console.error("Groq error:", err);
    return { ok: false, error: err.message || "AI call failed" };
  }
}

app.post("/ai", async (req, res) => {
  try {
    const { prompt, attachments } = req.body;

    if (!prompt?.trim()) {
      return res.status(400).json({ error: "Prompt bhejna zaroori hai" });
    }

    const aiResponse = await callGroqAI(prompt, attachments);

    if (!aiResponse.ok) {
      return res.status(500).json({ result: `AI error: ${aiResponse.error}` });
    }

    // Save chat if user logged in (optional)
    if (req.user?.id) {
      await Chat.create({
        userId: req.user.id,
        prompt,
        response: aiResponse.result
      });
    }

    res.json({ result: aiResponse.result });
  } catch (err) {
    console.error("/ai route error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
});

// 404 handler – JSON return karega
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler – JSON hi return karega
app.use((err, req, res, next) => {
  console.error("Global server error:", err.stack);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Codez AI server running on port ${PORT}`);
});
