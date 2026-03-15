import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
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

// Uploads (memory, small)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 }
});

function bufferToSafeText(buffer) {
  const text = buffer.toString("utf8");
  const nonPrintable = (text.match(/[^\x09\x0A\x0D\x20-\x7E]/g) || []).length;
  const ratio = text.length ? nonPrintable / text.length : 0;
  if (ratio > 0.2) return null;
  return text;
}

// Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callGroqAI(prompt, options = {}) {
  const { textAttachments = [], imageAttachments = [] } = options;
  if (!process.env.GROQ_API_KEY) {
    return "GROQ_API_KEY missing. Please set it in .env and redeploy.";
  }

  const attachmentNote = textAttachments.length
    ? "\n\nAttachments:\n" +
      textAttachments
        .map((a) => `- ${a.name}${a.content ? "\n" + a.content : ""}`)
        .join("\n\n")
    : "";

  const userContent = [
    {
      type: "text",
      text: `${prompt}${attachmentNote}`.trim()
    }
  ];

  if (imageAttachments.length) {
    imageAttachments.forEach((img) => {
      userContent.push({
        type: "image_url",
        image_url: { url: img.dataUrl }
      });
    });
  }

  const messages = [
    {
      role: "system",
      content:
        "You are Codez AI, a helpful coding assistant. Reply concisely in Hindi by default."
    },
    {
      role: "user",
      content: userContent
    }
  ];

  const model = imageAttachments.length
    ? process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct"
    : process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";

  const response = await groq.chat.completions.create({
    model,
    messages,
    temperature: 0.4,
    max_tokens: 800
  });

  return response?.choices?.[0]?.message?.content?.trim() || "No response";
}

app.post("/ai", upload.array("files", 10), async (req, res) => {
  try {
    const files = Array.from(req.files || []);
    const promptRaw = req.body?.prompt;
    const hasPrompt = promptRaw && String(promptRaw).trim();
    if (!hasPrompt && files.length === 0) {
      return res.status(400).json({ error: "Prompt or image required" });
    }

    const prompt = hasPrompt
      ? String(promptRaw)
      : "Please analyze the attached image(s).";

    const textAttachments = [];
    const imageAttachments = [];

    files.forEach((file) => {
      if (file.mimetype && file.mimetype.startsWith("image/")) {
        const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
        imageAttachments.push({
          name: file.originalname,
          dataUrl
        });
      } else {
        const text = bufferToSafeText(file.buffer);
        const snippet = text ? text.slice(0, 4000) : "[binary or unsupported file]";
        textAttachments.push({ name: file.originalname, content: snippet });
      }
    });

    const result = await callGroqAI(prompt, { textAttachments, imageAttachments });
    return res.json({ result });
  } catch (err) {
    console.error("[AI ERROR]", err);
    return res.status(500).json({ error: "AI request failed" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Codez AI running on port ${PORT}`);
});
