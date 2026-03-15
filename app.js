// API base URL (deployed pe relative use kar rahe hain)
const API_BASE = window.location.origin;
function apiUrl(path) {
  return API_BASE + path;
}

let attachments = [];

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
function appendChatMessage(role, text) {
  const log = document.getElementById("chatLog") || document.getElementById("result");
  if (!log) return null;

  const row = document.createElement("div");
  row.className = `chat-msg ${role}`;

  const body = document.createElement("div");
  body.className = "chat-msg-body";

  let formatted = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    lang = lang || "javascript";
    return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });

  body.innerHTML = formatted.replace(/\n/g, "<br>");

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

  return row;
}

// Main send function with full debug
async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  if (!input) {
    console.error("[ERROR] chatInput element nahi mila DOM mein");
    return;
  }

  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  appendChatMessage("user", message);

  const placeholder = appendChatMessage("ai", "Soch raha hoon...");

  try {
    const response = await fetch(apiUrl("/ai"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: message,
        attachments: attachments || []
      })
    });

    if (!response.ok) {
      throw new Error(`Server ne ${response.status} status diya`);
    }

    const data = await response.json();
    placeholder.remove();
    appendChatMessage("ai", data.result || data.error || "Koi jawab nahi mila");
  } catch (err) {
    console.error("[ERROR] Fetch mein problem:", err.message, err.stack);
    placeholder.remove();
    appendChatMessage("ai", "Error: " + err.message + " (console check karo)");
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

function setActiveThread(newItem) {
  document.querySelectorAll(".thread-item").forEach((el) => el.classList.remove("active"));
  if (newItem) newItem.classList.add("active");
}

function addThreadItem(title) {
  const group = document.getElementById("threadGroup") || document.querySelector(".thread-group");
  if (!group) return null;

  const item = document.createElement("div");
  item.className = "thread-item";
  item.innerHTML = `
    <div class="thread-title">${escapeHtml(title)}</div>
    <div class="thread-time">just now</div>
  `;
  item.addEventListener("click", () => setActiveThread(item));
  group.prepend(item);
  setActiveThread(item);
  return item;
}

function startNewThread() {
  const chatLog = document.getElementById("chatLog");
  if (chatLog) chatLog.innerHTML = "";
  const input = document.getElementById("chatInput");
  if (input) input.value = "";
  addThreadItem("New conversation");
  appendChatMessage("ai", "New conversation started.");
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

  const attachInfo = document.getElementById("attachInfo");
  const fileInputs = [
    document.getElementById("aiFile"),
    document.getElementById("chatFile"),
    document.getElementById("chatFolder")
  ].filter(Boolean);

  const updateAttachments = () => {
    const list = [];
    fileInputs.forEach((inputEl) => {
      Array.from(inputEl.files || []).forEach((f) => {
        list.push({ name: f.name, size: f.size });
      });
    });
    attachments = list;
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
      const root = files[0]?.webkitRelativePath?.split("/")[0] || "Project";
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
