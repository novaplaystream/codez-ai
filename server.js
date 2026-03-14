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
import { Groq } from "@groq/groq-sdk";   // ← नया import

const app = express();
const PORT = process.env.PORT || 3000;
const REPOS_DIR = path.join(process.cwd(), "repos");

if (!fs.existsSync(REPOS_DIR)) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
}

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

// MongoDB और session setup (वही रखो, change नहीं)

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "";
if (mongoUri) {
  mongoose.connect(mongoUri)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error("MongoDB connection failed", err));
}

// User, Chat, Log, Project schemas (वही रखो)

// passport और auth routes (वही रखो)

// Groq client initialize
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// नया AI call function
async function callGroqAI(prompt, attachments = []) {
  let fullPrompt = prompt;

  // attachments को prompt में जोड़ो
  if (attachments && attachments.length > 0) {
    fullPrompt += "\n\n=== Attached Files/Context ===\n";
    attachments.forEach(att => {
      fullPrompt += `\n--- File: ${att.name} ---\n${att.content.substring(0, 8000)}\n`; // limit to avoid token overflow
    });
    fullPrompt += "\nUse the above files/context to answer accurately.";
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are Codez AI - an expert coding assistant like OpenAI Codex. Respond in Hindi-English mix as user prefers. Help with code generation, explanation, debugging, optimization. Be precise, give clean code with comments."
        },
        { role: "user", content: fullPrompt }
      ],
      model: "deepseek-ai/deepseek-coder-v2-lite-preview",  // फ्री और अच्छा coding model
      temperature: 0.6,
      max_tokens: 4096,
      top_p: 0.9
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

// AI endpoint (ये replace कर दो पुराने /ai से)
app.post("/ai", async (req, res) => {
  const { prompt, attachments } = req.body;  // अब attachments भी accept करेगा

  if (!prompt) {
    return res.status(400).json({ error: "No prompt provided" });
  }

  const aiResponse = await callGroqAI(prompt, attachments);

  if (!aiResponse.ok) {
    return res.json({ result: `AI error: ${aiResponse.error}` });
  }

  // save chat अगर user logged in
  if (req.user) {
    await Chat.create({
      userId: req.user.id,
      prompt,
      response: aiResponse.result
    });
  }

  res.json({ result: aiResponse.result });
});

// बाकी सारे routes वैसे ही रखो (clone, pull, push, analyze, etc.)

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Codez AI running on port ${PORT}`);
});
