// API base URL (deployed pe relative use kar rahe hain)
<<<<<<< HEAD
const API_BASE = window.location.origin;
=======
const API_BASE = window.location.origin;  // automatically https://codez-ai-production.up.railway.app
>>>>>>> bb1698b43c79d148454420af0252e612d52936b1
function apiUrl(path) {
  return API_BASE + path;
}

<<<<<<< HEAD
let attachments = [];
=======
let attachments = [];  // agar attachments feature use kar rahe ho
>>>>>>> bb1698b43c79d148454420af0252e612d52936b1

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

<<<<<<< HEAD
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
=======
  // Code blocks ko highlight karne ke liye simple replace
  let formatted = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    lang = lang || 'javascript';
    return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });

  body.innerHTML = formatted.replace(/\n/g, '<br>');

  // Copy aur Delete buttons
  const actions = document.createElement("div");
  actions.className = "chat-msg-actions";
  actions.innerHTML = `
    <button class="chat-msg-btn" onclick="navigator.clipboard.writeText('${escapeHtml(text).replace(/'/g, "\\'")}')">Copy</button>
>>>>>>> bb1698b43c79d148454420af0252e612d52936b1
    <button class="chat-msg-btn danger" onclick="this.closest('.chat-msg').remove()">Delete</button>
  `;

  row.appendChild(body);
  row.appendChild(actions);
  log.appendChild(row);

<<<<<<< HEAD
=======
  // Auto scroll to bottom
>>>>>>> bb1698b43c79d148454420af0252e612d52936b1
  log.scrollTop = log.scrollHeight;

  return row;
}
<<<<<<< HEAD
=======

// Main send function with full debug
async function sendChatMessage() {
  console.log("[DEBUG] sendChatMessage() shuru hua");

  const input = document.getElementById("chatInput");
  if (!input) {
    console.error("[ERROR] chatInput element nahi mila DOM mein");
    return;
  }

  const message = input.value.trim();
  if (!message) {
    console.log("[DEBUG] Message khali hai, return kar raha");
    return;
  }

  console.log("[DEBUG] Message:", message);

  input.value = "";
>>>>>>> bb1698b43c79d148454420af0252e612d52936b1

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
<<<<<<< HEAD
=======
    console.log("[DEBUG] Fetch shuru: " + apiUrl("/ai"));

>>>>>>> bb1698b43c79d148454420af0252e612d52936b1
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

<<<<<<< HEAD
=======
    console.log("[DEBUG] Response status:", response.status);

>>>>>>> bb1698b43c79d148454420af0252e612d52936b1
    if (!response.ok) {
      throw new Error(`Server ne ${response.status} status diya`);
    }

    const data = await response.json();
<<<<<<< HEAD
=======
    console.log("[DEBUG] Response data:", data);

>>>>>>> bb1698b43c79d148454420af0252e612d52936b1
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
<<<<<<< HEAD
=======
  console.log("[DEBUG] runAI called with mode:", mode);

  // Agar Monaco editor hai to usse code le, warna fallback
>>>>>>> bb1698b43c79d148454420af0252e612d52936b1
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

<<<<<<< HEAD
  if (!prompt.trim()) return;

  appendChatMessage("user", `(${mode.toUpperCase()}) ${prompt.substring(0, 100)}...`);
=======
  if (!prompt.trim()) {
    console.warn("[WARN] Prompt khali hai");
    return;
  }

  appendChatMessage("user", `(${mode.toUpperCase()}) ${prompt.substring(0, 100)}...`);

>>>>>>> bb1698b43c79d148454420af0252e612d52936b1
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
<<<<<<< HEAD
}

function setActiveThread(newItem) {
  document.querySelectorAll(".thread-item").forEach((el) => el.classList.remove("active"));
  if (newItem) newItem.classList.add("active");
}

function addThreadItem(title) {
  const group = document.querySelector(".thread-group");
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
=======
>>>>>>> bb1698b43c79d148454420af0252e612d52936b1
}

// Sab kuch DOM ready hone ke baad bind karo
document.addEventListener("DOMContentLoaded", () => {
<<<<<<< HEAD
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

  const fileInput = document.getElementById("aiFile");
  const attachInfo = document.getElementById("attachInfo");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      attachments = Array.from(fileInput.files || []).map((f) => ({
        name: f.name,
        size: f.size
      }));
      if (attachInfo) {
        attachInfo.textContent = attachments.length
          ? `${attachments.length} file(s) attached`
          : "No attachments";
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

=======
  console.log("DOM ready → binding send button");

  const sendBtn = document.querySelector(".chat-send");
  if (sendBtn) {
    sendBtn.addEventListener("click", sendChatMessage);
    console.log("Send button successfully bound");
  } else {
    console.error("Send button (.chat-send) nahi mila DOM mein");
  }

  // Enter key wala code bhi yahin rakh (pehle se hai toh theek)
});
  } else {
    console.error("[CRITICAL] chatInput ID nahi mila");
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      console.log("[DEBUG] Send button click → sendChatMessage");
      sendChatMessage();
    });
  } else {
    console.error("[CRITICAL] .chat-send button nahi mila");
  }

  // Monaco editor init (agar use kar rahe ho)
  if (typeof monaco !== 'undefined') {
    console.log("[INFO] Monaco editor shuru kar rahe hain");
    window.editor = monaco.editor.create(document.getElementById("editor"), {
      value: "// Code yahan paste karo\n",
      language: "javascript",
      theme: "vs-dark"
    });
  }
});

// Optional: agar attachments feature chahiye toh yahan add kar sakte ho
>>>>>>> bb1698b43c79d148454420af0252e612d52936b1
