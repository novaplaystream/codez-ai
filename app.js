// API base URL (deployed pe relative use kar rahe hain)
const API_BASE = window.location.origin;
function apiUrl(path) {
  return API_BASE + path;
}

let attachments = [];
let selectedFiles = [];

const THREADS_KEY = "codez_threads_v1";
const ACTIVE_THREAD_KEY = "codez_active_thread_v1";
let threads = [];
let activeThreadId = null;

// Simple HTML escape function
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
      del.textContent = "×";
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

async function refreshModels() {
  const listEl = document.getElementById("modelList");
  if (listEl) listEl.textContent = "Loading models...";

  try {
    const res = await fetch(apiUrl("/models"));
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];

    if (!listEl) return;
    listEl.innerHTML = "";

    if (models.length === 0) {
      listEl.textContent = "No models available for this key.";
      return;
    }

    models.forEach((m) => {
      const item = document.createElement("div");
      item.className = "model-item";
      const name = document.createElement("div");
      name.className = "model-name";
      name.textContent = m.id || "unknown-model";
      const meta = document.createElement("div");
      meta.className = "model-meta";
      const parts = [];
      if (m.owned_by) parts.push(m.owned_by);
      if (m.context_window) parts.push(`ctx ${m.context_window}`);
      meta.textContent = parts.join(" • ");
      item.appendChild(name);
      if (meta.textContent) item.appendChild(meta);
      listEl.appendChild(item);
    });
  } catch (err) {
    if (listEl) listEl.textContent = "Models load failed. Check server logs.";
    console.error("[ERROR] models fetch", err);
  }
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

  const placeholder = appendChatMessage("ai", "Soch raha hoon...", { persist: false });

  try {
    const finalPrompt = message || "Please analyze the attached image(s).";
    let response;
    if (selectedFiles.length > 0) {
      const form = new FormData();
      form.append("prompt", finalPrompt);
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
          attachments: attachments || []
        })
      });
    }

    if (!response.ok) {
      throw new Error(`Server ne ${response.status} status diya`);
    }

    const data = await response.json();
    placeholder.remove();
    appendChatMessage("ai", data.result || data.error || "Koi jawab nahi mila");

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

  const input = document.getElementById("chatInput");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChatMessage();
    });
  }

  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      const status = document.getElementById("authStatus");
      if (status) status.textContent = "Connected (demo)";
      appendChatMessage("ai", "GitHub login flow is not wired yet.");
    });
  }

  const googleLoginBtn = document.getElementById("googleLoginBtn");
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", () => {
      const status = document.getElementById("authStatus");
      if (status) status.textContent = "Connected (demo)";
      appendChatMessage("ai", "Google login flow is not wired yet.");
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
  if (projectFolder) {
    projectFolder.addEventListener("change", () => {
      const files = Array.from(projectFolder.files || []);
      const root = files[0]?.webkitRelativePath?.split("/")[0] || files[0]?.name || "Project";
      if (projectInfo) {
        projectInfo.textContent = files.length
          ? `${root} (${files.length} files)`
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
