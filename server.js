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

const app = express();
const PORT = process.env.PORT || 3000;
const REPOS_DIR = path.join(process.cwd(), "repos");
const FRONTEND_URL = (process.env.FRONTEND_URL || "").replace(/\/$/, "");

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
app.use(express.static(process.cwd()));
app.get("/", (req, res) => res.send("OK"));

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "";
if (mongoUri) {
  try {
    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed", err);
  }
}

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection", err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception", err);
});

const userSchema = new mongoose.Schema({
  provider: String,
  providerId: { type: String, unique: true },
  githubId: String,
  googleId: String,
  username: String,
  email: String,
  avatarUrl: String,
  accessToken: String
});

const chatSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  prompt: String,
  response: String,
  createdAt: { type: Date, default: Date.now }
});

const logSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  message: String,
  createdAt: { type: Date, default: Date.now }
});

const projectSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  repoUrl: String,
  repoId: String,
  repoPath: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Chat = mongoose.model("Chat", chatSchema);
const Log = mongoose.model("Log", logSchema);
const Project = mongoose.model("Project", projectSchema);

app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false,
  store: mongoUri
    ? MongoStore.create({ mongoUrl: mongoUri })
    : undefined,
  cookie: {
    httpOnly: true,
    sameSite: process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === "production" ? "none" : "lax"),
    secure: process.env.NODE_ENV === "production"
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL || `http://localhost:${PORT}/auth/github/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const existing = await User.findOne({ provider: "github", providerId: profile.id });
      if (existing) {
        existing.username = profile.username;
        existing.avatarUrl = profile.photos?.[0]?.value || "";
        existing.accessToken = accessToken;
        await existing.save();
        return done(null, existing);
      }

      const user = await User.create({
        provider: "github",
        providerId: profile.id,
        githubId: profile.id,
        username: profile.username,
        email: profile.emails?.[0]?.value || "",
        avatarUrl: profile.photos?.[0]?.value || "",
        accessToken
      });
      done(null, user);
    } catch (err) {
      done(err);
    }
  }));
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/auth/google/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const existing = await User.findOne({ provider: "google", providerId: profile.id });
      if (existing) {
        existing.username = profile.displayName;
        existing.email = profile.emails?.[0]?.value || "";
        existing.avatarUrl = profile.photos?.[0]?.value || "";
        existing.accessToken = accessToken;
        await existing.save();
        return done(null, existing);
      }

      const user = await User.create({
        provider: "google",
        providerId: profile.id,
        googleId: profile.id,
        username: profile.displayName,
        email: profile.emails?.[0]?.value || "",
        avatarUrl: profile.photos?.[0]?.value || "",
        accessToken
      });
      done(null, user);
    } catch (err) {
      done(err);
    }
  }));
}

app.use(passport.initialize());
app.use(passport.session());

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
}

function redirectToClient(res, path) {
  if (FRONTEND_URL) {
    return res.redirect(FRONTEND_URL + path);
  }
  return res.redirect(path);
}

function repoIdFromUrl(repoUrl) {
  try {
    const u = new URL(repoUrl);
    const parts = u.pathname.replace(/\.git$/i, "").split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  } catch (_) {
    // fallback below
  }
  const cleaned = repoUrl.replace(/\.git$/i, "").split("/").filter(Boolean);
  return cleaned.slice(-2).join("-");
}

function withToken(repoUrl, token) {
  if (!token) return repoUrl;
  if (repoUrl.startsWith("https://")) {
    return repoUrl.replace("https://", `https://oauth2:${token}@`);
  }
  return repoUrl;
}

function safePath(repoPath, relPath) {
  const full = path.resolve(repoPath, relPath || "");
  if (!full.startsWith(repoPath)) {
    throw new Error("Invalid path");
  }
  return full;
}

async function listFiles(dir, root) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFiles(full, root));
    } else {
      results.push(path.relative(root, full));
    }
  }
  return results;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveUrl(baseUrl, input) {
  try {
    return new URL(input, baseUrl).toString();
  } catch {
    return null;
  }
}

function getOpenRouterKeys() {
  return [
    process.env.OPENROUTER_KEY,
    process.env.OPENROUTER_KEY2,
    process.env.OPENROUTER_KEY3,
    process.env.OPENROUTER_KEY4
  ].filter(Boolean);
}

async function callOpenRouter(prompt) {
  const keys = getOpenRouterKeys();
  if (keys.length === 0) {
    return { ok: false, error: "Missing OpenRouter API keys" };
  }

  const retryableStatuses = new Set([401, 402, 403, 429, 500, 503]);
  const errors = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
          },
          body: JSON.stringify({
            model: "deepseek/deepseek-chat",
            messages: [{ role: "user", content: prompt }]
          })
        }
      );

      const data = await response.json();
      if (response.ok && data?.choices?.[0]?.message?.content) {
        return { ok: true, result: data.choices[0].message.content, keyIndex: i + 1 };
      }

      const errMsg = data?.error?.message || data?.error || response.statusText || "Unknown error";
      errors.push({ keyIndex: i + 1, status: response.status, error: errMsg });
      if (!retryableStatuses.has(response.status)) {
        break;
      }
    } catch (err) {
      errors.push({ keyIndex: i + 1, status: 0, error: String(err) });
    }
  }

  return { ok: false, error: "All keys failed", details: errors };
}

app.get("/auth/github", passport.authenticate("github", { scope: ["repo", "read:user", "user:email"] }));

app.get("/auth/github/callback", (req, res, next) => {
  passport.authenticate("github", (err, user) => {
    if (err || !user) return redirectToClient(res, "/?auth=fail");
    req.logIn(user, () => redirectToClient(res, "/?auth=ok"));
  })(req, res, next);
});

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback", (req, res, next) => {
  passport.authenticate("google", (err, user) => {
    if (err || !user) return redirectToClient(res, "/?auth=fail");
    req.logIn(user, () => redirectToClient(res, "/?auth=ok"));
  })(req, res, next);
});

app.get("/api/me", (req, res) => {
  if (!req.user) return res.json(null);
  res.json({
    id: req.user.id,
    username: req.user.username,
    avatarUrl: req.user.avatarUrl,
    provider: req.user.provider
  });
});

app.post("/api/logout", (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

app.post("/api/analyze-url", async (req, res) => {
  const targetUrl = req.body.url || "";
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    const pageRes = await fetchWithTimeout(targetUrl, {
      headers: {
        "User-Agent": "CodezAI-Analyzer/1.0"
      }
    });

    const html = await pageRes.text();
    const $ = cheerio.load(html);
    const title = $("title").text().trim();

    const scriptTags = $("script[src]").toArray().map(el => {
      const src = $(el).attr("src");
      return { src: resolveUrl(targetUrl, src) || src };
    }).filter(s => s.src);

    const styleTags = $("link[rel='stylesheet']").toArray().map(el => {
      const href = $(el).attr("href");
      return { href: resolveUrl(targetUrl, href) || href };
    }).filter(s => s.href);

    const buttons = $("button, [role='button'], input[type='button'], input[type='submit']").toArray().map(el => {
      const $el = $(el);
      return {
        tag: el.tagName,
        text: ($el.text() || $el.val() || "").trim(),
        id: $el.attr("id") || "",
        class: $el.attr("class") || "",
        onclick: $el.attr("onclick") || ""
      };
    });

    const issues = [];

    const scriptChecks = await Promise.all(scriptTags.map(async s => {
      if (!s.src) return { ...s, ok: false, status: 0 };
      try {
        const r = await fetchWithTimeout(s.src, { method: "HEAD" });
        return { ...s, ok: r.ok, status: r.status };
      } catch {
        return { ...s, ok: false, status: 0 };
      }
    }));

    const styleChecks = await Promise.all(styleTags.map(async s => {
      if (!s.href) return { ...s, ok: false, status: 0 };
      try {
        const r = await fetchWithTimeout(s.href, { method: "HEAD" });
        return { ...s, ok: r.ok, status: r.status };
      } catch {
        return { ...s, ok: false, status: 0 };
      }
    }));

    const missingScripts = scriptChecks.filter(s => !s.ok);
    const missingStyles = styleChecks.filter(s => !s.ok);

    if (missingScripts.length) issues.push(`Missing/broken scripts: ${missingScripts.length}`);
    if (missingStyles.length) issues.push(`Missing/broken stylesheets: ${missingStyles.length}`);

    const buttonsWithoutHandlers = buttons.filter(b => !b.onclick && !b.text.toLowerCase().includes("submit"));
    if (buttonsWithoutHandlers.length) {
      issues.push(`Buttons without inline handler (static check): ${buttonsWithoutHandlers.length}`);
    }

    res.json({
      url: targetUrl,
      status: pageRes.status,
      title,
      scripts: scriptChecks,
      styles: styleChecks,
      buttons,
      issues
    });
  } catch (err) {
    res.status(500).json({ error: "Analyze failed", details: String(err) });
  }
});

app.post("/ai", async (req, res) => {
  const prompt = req.body.prompt || "";

  const result = await callOpenRouter(prompt);
  if (!result.ok) {
    return res.json({ result: "AI response error: " + JSON.stringify(result) });
  }

  if (req.user) {
    await Chat.create({ userId: req.user.id, prompt, response: result.result });
  }

  res.json({ result: result.result });
});

app.get("/api/chats", requireAuth, async (req, res) => {
  const chats = await Chat.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50);
  res.json(chats);
});

app.post("/api/logs", requireAuth, async (req, res) => {
  const message = req.body.message || "";
  const log = await Log.create({ userId: req.user.id, message });
  res.json(log);
});

app.get("/api/repos", requireAuth, async (req, res) => {
  const repos = await Project.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(repos);
});

app.post("/api/repos/clone", requireAuth, async (req, res) => {
  const repoUrl = req.body.repoUrl || "";
  if (!repoUrl) return res.status(400).json({ error: "Missing repoUrl" });

  const repoId = repoIdFromUrl(repoUrl);
  const repoPath = path.join(REPOS_DIR, repoId);
  if (fs.existsSync(repoPath)) {
    return res.json({ repoId, repoPath, alreadyExists: true });
  }

  const git = simpleGit();
  const urlWithToken = withToken(repoUrl, req.user.accessToken);
  await git.clone(urlWithToken, repoPath, ["--depth", "1"]);

  const project = await Project.create({
    userId: req.user.id,
    repoUrl,
    repoId,
    repoPath
  });

  res.json(project);
});

app.get("/api/repos/:repoId/files", requireAuth, async (req, res) => {
  const project = await Project.findOne({ userId: req.user.id, repoId: req.params.repoId });
  if (!project) return res.status(404).json({ error: "Repo not found" });

  const files = await listFiles(project.repoPath, project.repoPath);
  res.json(files);
});

app.get("/api/repos/:repoId/file", requireAuth, async (req, res) => {
  const project = await Project.findOne({ userId: req.user.id, repoId: req.params.repoId });
  if (!project) return res.status(404).json({ error: "Repo not found" });

  const relPath = req.query.path;
  if (!relPath) return res.status(400).json({ error: "Missing path" });

  const full = safePath(project.repoPath, relPath);
  const content = await fs.promises.readFile(full, "utf8");
  res.json({ path: relPath, content });
});

app.post("/api/repos/:repoId/file", requireAuth, async (req, res) => {
  const project = await Project.findOne({ userId: req.user.id, repoId: req.params.repoId });
  if (!project) return res.status(404).json({ error: "Repo not found" });

  const relPath = req.body.path;
  const content = req.body.content ?? "";
  if (!relPath) return res.status(400).json({ error: "Missing path" });

  const full = safePath(project.repoPath, relPath);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, content, "utf8");
  res.json({ ok: true });
});

app.post("/api/repos/:repoId/pull", requireAuth, async (req, res) => {
  const project = await Project.findOne({ userId: req.user.id, repoId: req.params.repoId });
  if (!project) return res.status(404).json({ error: "Repo not found" });

  const git = simpleGit(project.repoPath);
  await git.pull();
  res.json({ ok: true });
});

app.post("/api/repos/:repoId/push", requireAuth, async (req, res) => {
  const project = await Project.findOne({ userId: req.user.id, repoId: req.params.repoId });
  if (!project) return res.status(404).json({ error: "Repo not found" });

  const message = req.body.message || "Update from Codez AI";
  const git = simpleGit(project.repoPath);
  await git.add(".");
  await git.commit(message);
  await git.push("origin", "HEAD");
  res.json({ ok: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Codez AI API running on ${PORT}`);
});






