import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import fetch from "node-fetch";
import { Groq } from "groq-sdk";

const app = express();
const PORT = process.env.PORT || 3000;
app.set("trust proxy", 1);

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

app.get("/models", async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(400).json({ error: "GROQ_API_KEY missing" });
    }
    const response = await groq.models.list();
    const models = response?.data || [];
    return res.json({ models });
  } catch (err) {
    console.error("[MODELS ERROR]", err);
    return res.status(500).json({ error: "Models fetch failed" });
  }
});

app.get("/auth/github", (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(400).send("GitHub OAuth not configured.");
  }
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("host");
  const redirectUri =
    process.env.GITHUB_CALLBACK_URL || `${proto}://${host}/auth/github/callback`;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user user:email");
  return res.redirect(url.toString());
});

app.get("/auth/github/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!code || !clientId || !clientSecret) {
      return res.redirect(
        (process.env.FRONTEND_URL || "/") + "?auth=github&error=1"
      );
    }
    const proto = req.get("x-forwarded-proto") || req.protocol;
    const host = req.get("host");
    const redirectUri =
      process.env.GITHUB_CALLBACK_URL || `${proto}://${host}/auth/github/callback`;
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.redirect(
        (process.env.FRONTEND_URL || "/") + "?auth=github&error=1"
      );
    }
    return res.redirect((process.env.FRONTEND_URL || "/") + "?auth=github");
  } catch (err) {
    console.error("[GITHUB AUTH ERROR]", err);
    return res.redirect((process.env.FRONTEND_URL || "/") + "?auth=github&error=1");
  }
});

app.get("/auth/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(400).send("Google OAuth not configured.");
  }
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("host");
  const redirectUri =
    process.env.GOOGLE_CALLBACK_URL || `${proto}://${host}/auth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return res.redirect(url.toString());
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!code || !clientId || !clientSecret) {
      return res.redirect(
        (process.env.FRONTEND_URL || "/") + "?auth=google&error=1"
      );
    }
    const proto = req.get("x-forwarded-proto") || req.protocol;
    const host = req.get("host");
    const redirectUri =
      process.env.GOOGLE_CALLBACK_URL || `${proto}://${host}/auth/google/callback`;
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    });
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.redirect(
        (process.env.FRONTEND_URL || "/") + "?auth=google&error=1"
      );
    }
    return res.redirect((process.env.FRONTEND_URL || "/") + "?auth=google");
  } catch (err) {
    console.error("[GOOGLE AUTH ERROR]", err);
    return res.redirect((process.env.FRONTEND_URL || "/") + "?auth=google&error=1");
  }
});

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

function hasDevanagari(text) {
  return /[\u0900-\u097F]/.test(text || "");
}

async function ensureHindi(text) {
  if (!text) return text;
  if (hasDevanagari(text)) return text;

  const messages = [
    {
      role: "system",
      content: "Translate the assistant reply to Hindi only. Do not include any English."
    },
    {
      role: "user",
      content: text
    }
  ];

  const response = await groq.chat.completions.create({
    model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
    messages,
    temperature: 0.2,
    max_tokens: 800
  });

  return response?.choices?.[0]?.message?.content?.trim() || text;
}

async function callGroqAI(prompt, options = {}) {
  const { textAttachments = [], imageAttachments = [], modelOverride = "" } = options;
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

  const model = modelOverride
    ? modelOverride
    : imageAttachments.length
    ? process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct"
    : process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";

  const response = await groq.chat.completions.create({
    model,
    messages,
    temperature: 0.4,
    max_tokens: 800
  });

  const raw = response?.choices?.[0]?.message?.content?.trim() || "No response";
  return await ensureHindi(raw);
}

app.post("/ai", upload.array("files", 10), async (req, res) => {
  try {
    const files = Array.from(req.files || []);
    const promptRaw = req.body?.prompt;
    const modelOverride = req.body?.model ? String(req.body.model) : "";
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

    let bodyAttachments = [];
    if (Array.isArray(req.body?.attachments)) {
      bodyAttachments = req.body.attachments;
    } else if (typeof req.body?.attachments === "string") {
      try {
        bodyAttachments = JSON.parse(req.body.attachments);
      } catch {}
    }
    if (typeof req.body?.meta_attachments === "string") {
      try {
        const meta = JSON.parse(req.body.meta_attachments);
        if (Array.isArray(meta)) bodyAttachments = bodyAttachments.concat(meta);
      } catch {}
    }
    bodyAttachments.forEach((a) => {
      if (a && a.name && typeof a.content === "string") {
        const snippet = a.content.slice(0, 4000);
        textAttachments.push({ name: String(a.name), content: snippet });
      }
    });

    const result = await callGroqAI(prompt, { textAttachments, imageAttachments, modelOverride });
    return res.json({ result });
  } catch (err) {
    console.error("[AI ERROR]", err);
    return res.status(500).json({ error: "AI request failed" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Codez AI running on port ${PORT}`);
});
