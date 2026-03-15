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
  console.log("Send button clicked!");  // ← yeh line add kar

  const input = document.getElementById("chatInput");
  if (!input) {
    console.error("chatInput element nahi mila!");
    return;
  }

  const message = input.value.trim();
  if (!message) return;

  console.log("Message bheja ja raha:", message);  // debug

  input.value = "";

  appendChatMessage("user", message);

  const placeholder = appendChatMessage("ai", "Soch raha hoon...");

  try {
    console.log("Fetching /ai...");  // debug

    const response = await fetch("/ai", {  // ← relative URL try kar (deployed pe yeh sahi jaati hai)
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: message, attachments: [] })
    });

    console.log("Response status:", response.status);  // debug

    const data = await response.json();
    placeholder.remove();
    appendChatMessage("ai", data.result || data.error || "Koi reply nahi mila");
  } catch (err) {
    console.error("Fetch error:", err);
    placeholder.remove();
    appendChatMessage("ai", "Error: " + err.message);
  }
}

// Enter key support (agar pehle nahi tha)
const chatInput = document.getElementById("chatInput");
if (chatInput) {
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
}

// Button click bind (agar onclick nahi chal raha toh yeh add kar)
const sendBtn = document.querySelector(".chat-send");
if (sendBtn) {
  sendBtn.addEventListener("click", sendChatMessage);
}

// Enter key support
document.getElementById("chatInput")?.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});
