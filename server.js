import "dotenv/config";
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import session from "express-session";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";
import path from "path";
import fs from "fs";
import { simpleGit } from "simple-git";

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
app.use(express.static(process.cwd()));

if (process.env.MONGODB_URI) {
  await mongoose.connect(process.env.MONGODB_URI);
}

const userSchema = new mongoose.Schema({
  githubId: { type: String, unique: true },
  username: String,
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
  store: process.env.MONGODB_URI
    ? MongoStore.create({ mongoUrl: process.env.MONGODB_URI })
    : undefined,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
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
      const existing = await User.findOne({ githubId: profile.id });
      if (existing) {
        existing.username = profile.username;
        existing.avatarUrl = profile.photos?.[0]?.value || "";
        existing.accessToken = accessToken;
        await existing.save();
        return done(null, existing);
      }

      const user = await User.create({
        githubId: profile.id,
        username: profile.username,
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

app.get("/auth/github", passport.authenticate("github", { scope: ["repo", "read:user", "user:email"] }));

app.get("/auth/github/callback", passport.authenticate("github", { failureRedirect: "/?auth=fail" }), (req, res) => {
  res.redirect("/?auth=ok");
});

app.get("/api/me", (req, res) => {
  if (!req.user) return res.json(null);
  res.json({
    id: req.user.id,
    username: req.user.username,
    avatarUrl: req.user.avatarUrl
  });
});

app.post("/api/logout", (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

app.post("/ai", async (req, res) => {
  const prompt = req.body.prompt || "";

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-chat",
          messages: [{ role: "user", content: prompt }]
        })
      }
    );

    const data = await response.json();
    const result = data?.choices?.[0]?.message?.content || "AI response error";

    if (req.user) {
      await Chat.create({ userId: req.user.id, prompt, response: result });
    }

    res.json({ result });
  } catch (err) {
    res.json({ result: "AI response error: " + err });
  }
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

app.listen(PORT, () => {
  console.log(`Codez AI API running on ${PORT}`);
});
