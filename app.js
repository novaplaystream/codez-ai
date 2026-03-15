// API base URL (deployed pe relative use kar rahe hain)
const API_BASE = window.location.origin;  // automatically https://codez-ai-production.up.railway.app
function apiUrl(path) {
  return API_BASE + path;
}

let attachments = [];  // agar attachments feature use kar rahe ho

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
    <button class="chat-msg-btn danger" onclick="this.closest('.chat-msg').remove()">Delete</button>
  `;

  row.appendChild(body);
  row.appendChild(actions);
  log.appendChild(row);

  // Auto scroll to bottom
  log.scrollTop = log.scrollHeight;

  return row;
}

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

  appendChatMessage("user", message);

  const placeholder = appendChatMessage("ai", "Soch raha hoon...");

  try {
    console.log("[DEBUG] Fetch shuru: " + apiUrl("/ai"));

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

    console.log("[DEBUG] Response status:", response.status);

    if (!response.ok) {
      throw new Error(`Server ne ${response.status} status diya`);
    }

    const data = await response.json();
    console.log("[DEBUG] Response data:", data);

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
  console.log("[DEBUG] runAI called with mode:", mode);

  // Agar Monaco editor hai to usse code le, warna fallback
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

  if (!prompt.trim()) {
    console.warn("[WARN] Prompt khali hai");
    return;
  }

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

// Sab kuch DOM ready hone ke baad bind karo
document.addEventListener("DOMContentLoaded", () => {
  console.log("[INFO] DOM loaded – event listeners bind kar rahe hain");

  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.querySelector(".chat-send");

  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        console.log("[DEBUG] Enter key press → sendChatMessage");
        sendChatMessage();
      }
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
