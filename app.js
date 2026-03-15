// API base URL (prefer backend-url meta when frontend is hosted separately)
const BACKEND_BASE =
  document.querySelector('meta[name="backend-url"]')?.content?.trim() ||
  window.location.origin;
const API_BASE = BACKEND_BASE;
function apiUrl(path) {
  return API_BASE + path;
}

let attachments = [];
let selectedFiles = [];
let projectAttachments = [];
let projectDirHandle = null;
let projectFileHandles = new Map();
let projectFileContents = new Map();
let pendingChanges = [];
let pendingCommitMessage = "";
let pendingAction = "";

const THREADS_KEY = "codez_threads_v1";
const ACTIVE_THREAD_KEY = "codez_active_thread_v1";
const SELECTED_MODEL_KEY = "codez_selected_model_v1";
let threads = [];
let activeThreadId = null;
let selectedModel = "";

// Simple HTML escape function
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isTextFileName(name) {
  return /\.(js|ts|jsx|tsx|json|md|txt|html|css|py|java|rb|go|rs|yml|yaml|env|xml|csv|toml|ini|sh|bat|ps1)$/i.test(
    name || ""
  );
}

async function readFileHandle(handle, maxPerFile) {
  const file = await handle.getFile();
  if (file.size > 2 * 1024 * 1024) return null;
  if (!file.type || file.type.startsWith("text/") || isTextFileName(file.name)) {
    const text = await file.text();
    return text.slice(0, maxPerFile);
  }
  return null;
}

async function collectProjectFilesFromDir(dirHandle, prefix = "") {
  for await (const [name, handle] of dirHandle.entries()) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === "build") {
      continue;
    }
    if (handle.kind === "file") {
      const path = prefix ? `${prefix}/${name}` : name;
      projectFileHandles.set(path, handle);
    } else if (handle.kind === "directory") {
      const nextPrefix = prefix ? `${prefix}/${name}` : name;
      await collectProjectFilesFromDir(handle, nextPrefix);
    }
  }
}

function updateProjectInfoText(baseText, readCount) {
  const projectInfo = document.getElementById("projectInfo");
  if (!projectInfo) return;
  if (!baseText) {
    projectInfo.textContent = "No project added";
    return;
  }
  const suffix = typeof readCount === "number" ? `, ${readCount} read` : "";
  projectInfo.textContent = `${baseText}${suffix}`;
}

function updatePendingCommitUI() {
  const info = document.getElementById("pendingCommitInfo");
  const input = document.getElementById("pendingCommitMsg");
  if (!info || !input) return;

  if (!pendingChanges.length) {
    info.textContent = "No pending changes";
    input.value = "";
    input.disabled = true;
    return;
  }

  info.textContent = `Pending changes: ${pendingChanges.length}`;
  input.disabled = false;
  if (pendingCommitMessage) {
    input.value = pendingCommitMessage;
  }
}

async function loadProjectFromHandle(dirHandle) {
  projectAttachments = [];
  projectFileHandles = new Map();
  projectFileContents = new Map();

  await collectProjectFilesFromDir(dirHandle);

  const maxTotalChars = 300000;
  const maxPerFile = 50000;
  let total = 0;
  const collected = [];

  for (const [path, handle] of projectFileHandles.entries()) {
    if (total >= maxTotalChars) break;
    const text = await readFileHandle(handle, Math.min(maxPerFile, maxTotalChars - total));
    if (typeof text === "string") {
      total += text.length;
      const item = { name: path, content: text };
      collected.push(item);
      projectFileContents.set(path, text);
    }
  }

  projectAttachments = collected;
  updateProjectInfoText(`${projectFileHandles.size} files`, projectAttachments.length);
}

async function openProjectFolder() {
  if (!window.showDirectoryPicker) {
    const fallback = document.getElementById("projectFolder");
    if (fallback) fallback.click();
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker();
    const perm = await dirHandle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") return;
    projectDirHandle = dirHandle;
    await loadProjectFromHandle(dirHandle);
  } catch (err) {
    console.error("[ERROR] openProjectFolder", err);
  }
}

// Chat message append with code highlighting support
function appendChatMessage(role, text, opts = {}) {
  const log = document.getElementById("chatLog") || document.getElementById("result");
  if (!log) return null;

  const row = document.createElement("div");
  row.className = `chat-msg ${role}`;

  const body = document.createElement("div");
  body.className = "chat-msg-body";

  if (Array.isArray(opts.images) && opts.images.length) {
    const gallery = document.createElement("div");
    gallery.className = "chat-imgs";
    opts.images.forEach((src) => {
      const img = document.createElement("img");
      img.className = "chat-img";
      img.src = src;
      img.alt = "User attachment";
      img.loading = "lazy";
      gallery.appendChild(img);
    });
    body.appendChild(gallery);
  }

  let formatted = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    lang = lang || "javascript";
    return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });

  const textBlock = document.createElement("div");
  textBlock.className = "chat-text";
  textBlock.innerHTML = formatted.replace(/\n/g, "<br>");
  body.appendChild(textBlock);

  const actions = document.createElement("div");
  actions.className = "chat-msg-actions";
  const safeText = escapeHtml(text).replace(/'/g, "\\'");
  actions.innerHTML = `
    <button class="chat-msg-btn" onclick="navigator.clipboard.writeText('${safeText}')">Copy</button>
    <button class="chat-msg-btn danger" onclick="this.closest('.chat-msg').remove()">Delete</button>
  `;

  row.appendChild(body);
  row.appendChild(actions);
  log.appendChild(row);

  log.scrollTop = log.scrollHeight;

  if (opts.persist !== false && (role === "user" || role === "ai")) {
    persistMessage(role, text);
  }

  return row;
}

function loadThreads() {
  try {
    const saved = localStorage.getItem(THREADS_KEY);
    threads = saved ? JSON.parse(saved) : [];
  } catch {
    threads = [];
  }
  activeThreadId = localStorage.getItem(ACTIVE_THREAD_KEY);
}

function saveThreads() {
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
  if (activeThreadId) {
    localStorage.setItem(ACTIVE_THREAD_KEY, activeThreadId);
  }
}

function getActiveThread() {
  return threads.find((t) => t.id === activeThreadId) || null;
}

function renderThreadList() {
  const group = document.getElementById("threadGroup");
  if (!group) return;
  group.innerHTML = "";

  if (!threads.length) {
    const empty = document.createElement("div");
    empty.className = "thread-empty";
    empty.textContent = "No threads yet";
    group.appendChild(empty);
    return;
  }

  threads
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .forEach((thread) => {
      const item = document.createElement("div");
      item.className = "thread-item";
      if (thread.id === activeThreadId) item.classList.add("active");

      const title = document.createElement("div");
      title.className = "thread-title";
      title.textContent = thread.title || "New conversation";

      const time = document.createElement("div");
      time.className = "thread-time";
      time.textContent = thread.updatedAt
        ? new Date(thread.updatedAt).toLocaleString()
        : "just now";

      const del = document.createElement("button");
      del.className = "thread-delete";
      del.title = "Delete thread";
      del.textContent = "x";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteThread(thread.id);
      });

      item.appendChild(title);
      item.appendChild(time);
      item.appendChild(del);

      item.addEventListener("click", () => {
        setActiveThread(thread.id);
      });

      group.appendChild(item);
    });
}

function createThread(title) {
  const id = `t_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const now = Date.now();
  const thread = {
    id,
    title: title || "New conversation",
    createdAt: now,
    updatedAt: now,
    messages: []
  };
  threads.push(thread);
  activeThreadId = id;
  saveThreads();
  renderThreadList();
  return thread;
}

function setActiveThread(id) {
  activeThreadId = id;
  saveThreads();
  renderThreadList();
  renderThreadMessages();
}

function deleteThread(id) {
  threads = threads.filter((t) => t.id !== id);
  if (activeThreadId === id) {
    activeThreadId = threads[0]?.id || null;
  }
  if (!activeThreadId && threads.length === 0) {
    createThread("New conversation");
  }
  saveThreads();
  renderThreadList();
  renderThreadMessages();
}

function persistMessage(role, text) {
  const thread = getActiveThread();
  if (!thread) return;
  thread.messages = thread.messages || [];
  thread.messages.push({ role, text, ts: Date.now() });
  thread.updatedAt = Date.now();
  if (!thread.title || thread.title === "New conversation") {
    if (role === "user" && text) {
      thread.title = text.slice(0, 40);
    }
  }
  saveThreads();
  renderThreadList();
}

function renderThreadMessages() {
  const chatLog = document.getElementById("chatLog");
  if (!chatLog) return;
  chatLog.innerHTML = "";
  const thread = getActiveThread();
  if (!thread) return;
  (thread.messages || []).forEach((msg) => {
    appendChatMessage(msg.role, msg.text, { persist: false });
  });
}

function extractJsonBlock(text) {
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return text.slice(first, last + 1);
  }
  return null;
}

async function getFileHandleForPath(path, create) {
  if (!projectDirHandle) return null;
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  let dir = projectDirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create });
  }
  return await dir.getFileHandle(parts[parts.length - 1], { create });
}

async function writeFileAtPath(path, content) {
  const handle = await getFileHandleForPath(path, true);
  if (!handle) return false;
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  projectFileHandles.set(path, handle);
  projectFileContents.set(path, content);
  return true;
}

async function applyEditsFromAI(aiText) {
  if (!projectDirHandle) {
    return { ok: false, message: "Write access नहीं मिला. पहले Open Folder करें." };
  }
  const jsonText = extractJsonBlock(aiText);
  if (!jsonText) return { ok: false, message: "AI response JSON नहीं मिला." };

  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return { ok: false, message: "AI response JSON parse नहीं हुआ." };
  }

  const edits = Array.isArray(payload.edits) ? payload.edits : [];
  if (!edits.length) {
    return { ok: false, message: "AI ने कोई edit नहीं दिया." };
  }

  const applied = [];
  for (const edit of edits) {
    const path = String(edit.path || edit.file || "").trim();
    const content = typeof edit.content === "string" ? edit.content : "";
    if (!path) continue;
    const ok = await writeFileAtPath(path, content);
    if (ok) applied.push(path);
  }

  if (!applied.length) {
    return { ok: false, message: "कोई file apply नहीं हो सकी." };
  }

  pendingChanges = applied;
  pendingCommitMessage = payload.commit_message || "";
  await loadProjectFromHandle(projectDirHandle);
  updatePendingCommitUI();
  return {
    ok: true,
    message: `Applied: ${applied.join(", ")}`,
    summary: payload.summary || "",
    commitMessage: pendingCommitMessage
  };
}

async function refreshModels() {
  const selectEl = document.getElementById("modelSelect");

  try {
    const res = await fetch(apiUrl("/models"));
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];

    if (selectEl) selectEl.innerHTML = "";

    if (models.length === 0) {
      if (selectEl) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No models";
        selectEl.appendChild(opt);
      }
      return;
    }

    if (selectEl) {
      models.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.id;
        selectEl.appendChild(opt);
      });
      const saved = localStorage.getItem(SELECTED_MODEL_KEY);
      const exists = saved && models.some((m) => m.id === saved);
      selectedModel = exists ? saved : models[0].id;
      selectEl.value = selectedModel;
      localStorage.setItem(SELECTED_MODEL_KEY, selectedModel);

      selectEl.addEventListener("change", () => {
        selectedModel = selectEl.value;
        localStorage.setItem(SELECTED_MODEL_KEY, selectedModel);
      });
    }

  } catch (err) {
    console.error("[ERROR] models fetch", err);
  }
}

function isConfirmYes(text) {
  return /(ha+n|yes|yep|ok|haan|hmm ok|kr do|kar do)/i.test(text || "");
}

function isConfirmNo(text) {
  return /(nahi|no|cancel|na)/i.test(text || "");
}

function isEditRequest(text) {
  return /(fix|apply|update|change|edit|improve|refactor|optimize|better|kami|sahi|thik)/i.test(
    text || ""
  );
}

function isGitHubLogin(text) {
  return /(github).*?(login|signin|sign in)/i.test(text || "");
}

function isGoogleLogin(text) {
  return /(google).*?(login|signin|sign in)/i.test(text || "");
}

async function handleCommandIntent(message) {
  if (pendingAction === "commit") {
    if (isConfirmYes(message)) {
      pendingAction = "push";
      appendChatMessage(
        "ai",
        "Commit के लिए ये चलाएं:\n\ngit add -A\ngit commit -m \"" +
          (pendingCommitMessage || "update") +
          "\"\n\nअब push करूं? (haan/nahin)"
      );
      return true;
    }
    if (isConfirmNo(message)) {
      pendingAction = "";
      appendChatMessage("ai", "ठीक है, commit cancel कर दिया.");
      return true;
    }
  }

  if (pendingAction === "push") {
    if (isConfirmYes(message)) {
      pendingAction = "";
      appendChatMessage("ai", "Push के लिए चलाएं:\n\ngit push");
      return true;
    }
    if (isConfirmNo(message)) {
      pendingAction = "";
      appendChatMessage("ai", "ठीक है, push नहीं करेंगे.");
      return true;
    }
  }

  if (/commit/i.test(message || "")) {
    if (!pendingChanges.length) {
      appendChatMessage("ai", "अभी कोई applied changes नहीं हैं.");
      return true;
    }
    pendingAction = "commit";
    appendChatMessage("ai", "Commit करूं? (haan/nahin)");
    return true;
  }

  if (isGitHubLogin(message)) {
    window.location.href = `${BACKEND_BASE}/auth/github`;
    return true;
  }

  if (isGoogleLogin(message)) {
    window.location.href = `${BACKEND_BASE}/auth/google`;
    return true;
  }

  return false;
}

// Main send function
async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  if (!input) {
    console.error("[ERROR] chatInput element nahi mila DOM mein");
    return;
  }

  const message = input.value.trim();
  const hasFiles = selectedFiles.length > 0;
  if (!message && !hasFiles) return;

  input.value = "";
  const imagePreviews = [];
  if (hasFiles) {
    selectedFiles.forEach((file) => {
      if (file && file.type && file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        imagePreviews.push(url);
      }
    });
  }
  const userPreview = message || (hasFiles ? "[Image(s) attached]" : "");
  appendChatMessage("user", userPreview, { images: imagePreviews });

  if (await handleCommandIntent(message)) {
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    return;
  }

  const placeholder = appendChatMessage("ai", "Soch raha hoon...", { persist: false });

  try {
    let finalPrompt = message || "Please analyze the attached image(s).";
    const wantsApply = isEditRequest(message) && projectAttachments.length > 0;
    if (wantsApply && !projectDirHandle) {
      placeholder.remove();
      appendChatMessage("ai", "Edit/apply करने के लिए पहले Open Folder (write) करें.");
      return;
    }
    if (wantsApply) {
      finalPrompt =
        "User request: " +
        message +
        "\n\nYou will edit project files. Respond ONLY as JSON in this exact schema:\n" +
        "{ \"summary\": \"...\", \"commit_message\": \"...\", \"edits\": [ { \"path\": \"relative/path\", \"content\": \"full file content\" } ] }\n" +
        "Apply fixes or improvements requested by the user. Do not include any extra text.";
    }
    let response;
    if (selectedFiles.length > 0) {
      const form = new FormData();
      form.append("prompt", finalPrompt);
      if (selectedModel) form.append("model", selectedModel);
      if (projectAttachments.length) {
        form.append("meta_attachments", JSON.stringify(projectAttachments));
      }
      selectedFiles.forEach((file) => form.append("files", file, file.name));
      response = await fetch(apiUrl("/ai"), {
        method: "POST",
        body: form
      });
    } else {
      response = await fetch(apiUrl("/ai"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          attachments: projectAttachments.length ? projectAttachments : attachments || [],
          model: selectedModel || ""
        })
      });
    }

    if (!response.ok) {
      throw new Error(`Server ne ${response.status} status diya`);
    }

    const data = await response.json();
    placeholder.remove();

    if (wantsApply) {
      const applyResult = await applyEditsFromAI(data.result || "");
      if (applyResult.ok) {
        const summaryText = applyResult.summary ? applyResult.summary + "\n\n" : "";
        appendChatMessage(
          "ai",
          summaryText + applyResult.message + "\n\nCommit करूं? (haan/nahin)"
        );
        pendingAction = "commit";
      } else {
        appendChatMessage("ai", applyResult.message);
      }
    } else {
      const detail = data.error_detail ? ` (${data.error_detail})` : "";
      appendChatMessage("ai", data.result || (data.error ? data.error + detail : "Koi jawab nahi mila"));
    }

    // Clear attachments after successful send
    selectedFiles = [];
    attachments = [];
    const attachInfo = document.getElementById("attachInfo");
    if (attachInfo) attachInfo.textContent = "No attachments";
    ["aiFile", "chatFile", "chatFolder"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
  } catch (err) {
    console.error("[ERROR] Fetch mein problem:", err.message, err.stack);
    placeholder.remove();
    appendChatMessage("ai", "Error: " + err.message + " (console check karo)");
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
  }
}

// Quick action buttons (Generate, Explain, Debug, Optimize)
async function runAI(mode) {
  const code = window.editor?.getValue() || "";

  let prompt = "";
  switch (mode) {
    case "generate":
      prompt = "Naya code banao: " + (document.getElementById("chatInput")?.value || "simple example in JavaScript");
      break;
    case "explain":
      prompt = "Is code ko step-by-step Hindi-English mein samjhao:\n\n" + code;
      break;
    case "debug":
      prompt = "Is code mein bugs dhundho aur fix suggestions do:\n\n" + code;
      break;
    case "optimize":
      prompt = "Is code ko better, faster, cleaner banao with reasons:\n\n" + code;
      break;
    default:
      prompt = "Help me with: " + code;
  }

  if (!prompt.trim()) return;

  appendChatMessage("user", `(${mode.toUpperCase()}) ${prompt.substring(0, 100)}...`);
  const placeholder = appendChatMessage("ai", "Processing...");

  try {
    const res = await fetch(apiUrl("/ai"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    placeholder.remove();
    appendChatMessage("ai", data.result || "No response");
  } catch (err) {
    placeholder.remove();
    appendChatMessage("ai", "Error: " + err.message);
  }
}

function startNewThread() {
  const chatLog = document.getElementById("chatLog");
  if (chatLog) chatLog.innerHTML = "";
  const input = document.getElementById("chatInput");
  if (input) input.value = "";
  createThread("New conversation");
  renderThreadMessages();
  appendChatMessage("ai", "नई बातचीत शुरू हुई। मैं अब हिंदी में जवाब दूंगा।");
}

function cloneRepoUnified() {
  const url = document.getElementById("actionUrl")?.value.trim();
  if (!url) {
    appendChatMessage("ai", "Please paste a repo URL or website URL to clone.");
    return;
  }
  appendChatMessage("ai", `Clone request received: ${url}`);
}

function pushRepo() {
  const msg = document.getElementById("commitMsg")?.value.trim();
  if (!msg) {
    appendChatMessage("ai", "Please add a commit message first.");
    return;
  }
  appendChatMessage("ai", `Commit & push queued with message: ${msg}`);
}

function setupLabelToggles() {
  const buttons = Array.from(document.querySelectorAll("[data-label]"));
  if (buttons.length === 0) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      buttons.forEach((b) => {
        if (b !== btn) b.classList.remove("show-label");
      });
      btn.classList.toggle("show-label");
    });
  });

  document.addEventListener("click", () => {
    buttons.forEach((b) => b.classList.remove("show-label"));
  });
}

// Sab kuch DOM ready hone ke baad bind karo
document.addEventListener("DOMContentLoaded", () => {
  refreshModels();
  loadThreads();
  if (!threads.length) {
    createThread("Batao project ke bare mein");
    appendChatMessage("ai", "नई बातचीत शुरू हुई। मैं अब हिंदी में जवाब दूंगा।");
  } else if (!activeThreadId) {
    activeThreadId = threads[0].id;
  }
  saveThreads();
  renderThreadList();
  renderThreadMessages();
  updatePendingCommitUI();

  const input = document.getElementById("chatInput");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChatMessage();
    });
  }

  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      window.location.href = `${BACKEND_BASE}/auth/github`;
    });
  }

  const googleLoginBtn = document.getElementById("googleLoginBtn");
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", () => {
      window.location.href = `${BACKEND_BASE}/auth/google`;
    });
  }

  const params = new URLSearchParams(window.location.search);
  const auth = params.get("auth");
  const error = params.get("error");
  if (auth) {
    const status = document.getElementById("authStatus");
    if (error) {
      if (status) status.textContent = "Login failed";
      appendChatMessage("ai", `${auth} login failed. Please try again.`);
    } else {
      if (status) status.textContent = `Connected (${auth})`;
      appendChatMessage("ai", `${auth} login successful.`);
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const pendingCommitMsgInput = document.getElementById("pendingCommitMsg");
  if (pendingCommitMsgInput) {
    pendingCommitMsgInput.addEventListener("input", () => {
      pendingCommitMessage = pendingCommitMsgInput.value.trim();
    });
  }

  const prepareCommitBtn = document.getElementById("prepareCommitBtn");
  if (prepareCommitBtn) {
    prepareCommitBtn.addEventListener("click", () => {
      if (!pendingChanges.length) {
        appendChatMessage("ai", "अभी कोई applied changes नहीं हैं.");
        return;
      }
      const msg = pendingCommitMessage || "update";
      appendChatMessage(
        "ai",
        "Commit के लिए ये चलाएं:\n\ngit add -A\ngit commit -m \"" + msg + "\""
      );
      pendingAction = "push";
    });
  }

  const preparePushBtn = document.getElementById("preparePushBtn");
  if (preparePushBtn) {
    preparePushBtn.addEventListener("click", () => {
      if (!pendingChanges.length) {
        appendChatMessage("ai", "अभी कोई applied changes नहीं हैं.");
        return;
      }
      appendChatMessage("ai", "Push के लिए ये चलाएं:\n\ngit push");
      pendingAction = "";
    });
  }

  const attachInfo = document.getElementById("attachInfo");
  const fileInputs = [
    document.getElementById("aiFile"),
    document.getElementById("chatFile"),
    document.getElementById("chatFolder")
  ].filter(Boolean);

  const updateAttachments = () => {
    const list = [];
    const files = [];
    fileInputs.forEach((inputEl) => {
      Array.from(inputEl.files || []).forEach((f) => {
        list.push({ name: f.name, size: f.size });
        files.push(f);
      });
    });
    attachments = list;
    selectedFiles = files;
    if (attachInfo) {
      attachInfo.textContent = attachments.length
        ? `${attachments.length} file(s) attached`
        : "No attachments";
    }
  };

  fileInputs.forEach((inputEl) => {
    inputEl.addEventListener("change", updateAttachments);
  });

  const projectFolder = document.getElementById("projectFolder");
  const projectInfo = document.getElementById("projectInfo");
  const projectFolderBtn = document.getElementById("projectFolderBtn");
  if (projectFolderBtn) {
    projectFolderBtn.addEventListener("click", () => {
      openProjectFolder();
    });
  }
  if (projectFolder) {
    projectFolder.addEventListener("change", async () => {
      const files = Array.from(projectFolder.files || []);
      const root = files[0]?.webkitRelativePath?.split("/")[0] || files[0]?.name || "Project";

      const maxTotalChars = 300000;
      const maxPerFile = 50000;
      let total = 0;
      const collected = [];

      for (const file of files) {
        if (total >= maxTotalChars) break;
        if (file.size > 2 * 1024 * 1024) continue;
        if (!file.type || file.type.startsWith("text/") || file.name.match(/\.(js|ts|jsx|tsx|json|md|txt|html|css|py|java|rb|go|rs|yml|yaml|env|xml|csv)$/i)) {
          try {
            const text = await file.text();
            const snippet = text.slice(0, Math.min(maxPerFile, maxTotalChars - total));
            total += snippet.length;
            collected.push({ name: file.name, content: snippet });
          } catch {
            continue;
          }
        }
      }

      projectAttachments = collected;
      projectFileContents = new Map();
      collected.forEach((item) => projectFileContents.set(item.name, item.content));
      if (projectInfo) {
        const suffix = projectAttachments.length ? `, ${projectAttachments.length} read` : ", 0 read";
        projectInfo.textContent = files.length
          ? `${root} (${files.length} files${suffix})`
          : "No project added";
      }
    });
  }

  setupLabelToggles();

  if (typeof monaco !== "undefined") {
    const editorEl = document.getElementById("editor");
    if (editorEl) {
      window.editor = monaco.editor.create(editorEl, {
        value: "// Code yahan paste karo\n",
        language: "javascript",
        theme: "vs-dark"
      });
    }
  }
});
