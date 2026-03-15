import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
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

// Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callGroqAI(prompt, attachments = []) {
  if (!process.env.GROQ_API_KEY) {
    return "GROQ_API_KEY missing. Please set it in .env and redeploy.";
  }

  const attachmentNote =
    attachments && attachments.length
      ? `\n\nAttachments: ${attachments.map((a) => a.name).join(", ")}`
      : "";

  const messages = [
    {
      role: "system",
      content:
        "You are Codez AI, a helpful coding assistant. Reply concisely in Hindi-English mix."
    },
    {
      role: "user",
      content: `${prompt}${attachmentNote}`
    }
  ];

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    temperature: 0.4,
    max_tokens: 800
  });

  return response?.choices?.[0]?.message?.content?.trim() || "No response";
}

app.post("/ai", async (req, res) => {
  try {
    const { prompt, attachments } = req.body || {};
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: "Prompt missing" });
    }

    const result = await callGroqAI(String(prompt), attachments || []);
    return res.json({ result });
  } catch (err) {
    console.error("[AI ERROR]", err);
    return res.status(500).json({ error: "AI request failed" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Codez AI running on port ${PORT}`);
});
