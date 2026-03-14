// ... baaki code same rakh sakte ho jo pehle tha ...

function appendChatMessage(role, text) {
  const log = document.getElementById("chatLog") || document.getElementById("result");
  if (!log) return;

  const row = document.createElement("div");
  row.className = `chat-msg ${role}`;

  const body = document.createElement("div");
  body.className = "chat-msg-body";

  // Code block highlighting ke liye simple replace
  let formatted = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    lang = lang || 'javascript';
    return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });

  body.innerHTML = formatted.replace(/\n/g, '<br>');

  // Copy & delete buttons
  const actions = document.createElement("div");
  actions.className = "chat-msg-actions";
  actions.innerHTML = `
    <button class="chat-msg-btn" onclick="navigator.clipboard.writeText('${escapeHtml(text)}')">Copy</button>
    <button class="chat-msg-btn danger" onclick="this.parentElement.parentElement.remove()">Delete</button>
  `;

  row.appendChild(body);
  row.appendChild(actions);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// sendChatMessage function mein yeh use karo
async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  if (!input || !input.value.trim()) return;

  const message = input.value.trim();
  input.value = "";

  appendChatMessage("user", message);

  const placeholder = appendChatMessage("ai", "Soch raha hoon...");

  try {
    const res = await fetch(apiUrl("/ai"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        prompt: message,
        attachments: attachments || []
      })
    });

    const data = await res.json();
    if (placeholder) {
      placeholder.remove();
      appendChatMessage("ai", data.result || data.error || "Kuch response nahi mila");
    }
  } catch (err) {
    if (placeholder) {
      placeholder.remove();
      appendChatMessage("ai", "Error: " + err.message);
    }
  }
}

// Enter key support
document.getElementById("chatInput")?.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});
