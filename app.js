const API_BASE = (window.API_BASE)
  || (location.hostname.endsWith("github.io") ? "https://codez-ai-production.up.railway.app" : "");

function apiUrl(path){
  return API_BASE ? API_BASE + path : path;
}

let currentRepoId = null;
let currentFilePath = null;
let attachments = [];
let editorInitTimer = null;

function initEditorWithMonaco(){
  if(editorInitTimer) clearTimeout(editorInitTimer);
  window.editor=monaco.editor.create(
    document.getElementById("editor"),
    {
      value:"",
      language:"javascript",
      theme:"vs-dark",
      minimap:{enabled:false}
    }
  );

  addLog("Editor initialized");
  bootstrapAuth();
  bindAttachmentInputs();
  initAnalysisPanel();
}

function initFallbackEditor(){
  if(editorInitTimer) clearTimeout(editorInitTimer);
  const host = document.getElementById("editor");
  if(!host) return;
  const textarea = document.createElement("textarea");
  textarea.className = "editor-fallback";
  textarea.spellcheck = false;
  host.innerHTML = "";
  host.appendChild(textarea);
  window.editor = {
    getValue: () => textarea.value,
    setValue: (value) => { textarea.value = value || ""; }
  };
  addLog("Monaco unavailable; using fallback editor");
  bootstrapAuth();
  bindAttachmentInputs();
  initAnalysisPanel();
}

if(window.require && window.require.config){
  window.require.config({
    paths:{vs:"https://unpkg.com/monaco-editor@0.45.0/min/vs"}
  });

  window.require(["vs/editor/editor.main"],function(){
    initEditorWithMonaco();
  });

  editorInitTimer = setTimeout(() => {
    if(!window.editor) initFallbackEditor();
  }, 4000);
}else{
  if(document.readyState === "loading"){
    window.addEventListener("DOMContentLoaded", initFallbackEditor);
  }else{
    initFallbackEditor();
  }
}

function addLog(text){
  const log=document.getElementById("log");
  if(!log) return;
  const row=document.createElement("div");
  row.className="log-entry";
  row.innerHTML=`<span class="log-dot"></span><span>${new Date().toLocaleTimeString()} - ${text}</span>`;
  log.prepend(row);

  fetch(apiUrl("/api/logs"), {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    credentials:"include",
    body:JSON.stringify({message:text})
  }).catch(()=>{});
}

function setIconButton(btn, title){
  if(!btn) return;
  btn.setAttribute("title", title);
}

async function bootstrapAuth(){
  try{
    const res = await fetch(apiUrl("/api/me"), { credentials:"include" });
    const user = await res.json();
    const status = document.getElementById("authStatus");
    const btn = document.getElementById("loginBtn");
    const gbtn = document.getElementById("googleBtn");
    if(user && user.username){
      status.textContent = "@"+user.username;
      setIconButton(btn, "Logout");
      btn.onclick = logoutGithub;
      if(gbtn){
        setIconButton(gbtn, "Google Login");
        gbtn.style.display = "none";
      }
      addLog("Logged in as "+user.username);
      await loadHistory();
      await loadRepos();
    }else{
      status.textContent = "Guest";
      setIconButton(btn, "GitHub Login");
      btn.onclick = loginGithub;
      if(gbtn){
        setIconButton(gbtn, "Google Login");
        gbtn.style.display = "inline-flex";
      }
    }
  }catch(e){
    addLog("Auth check failed");
  }
}

function loginGithub(){
  const returnTo = encodeURIComponent(window.location.origin + window.location.pathname);
  window.location.href = apiUrl(`/auth/github?returnTo=${returnTo}`);
}

function loginGoogle(){
  const returnTo = encodeURIComponent(window.location.origin + window.location.pathname);
  window.location.href = apiUrl(`/auth/google?returnTo=${returnTo}`);
}

async function logoutGithub(){
  await fetch(apiUrl("/api/logout"), { method:"POST", credentials:"include" });
  await bootstrapAuth();
}

function bindAttachmentInputs(){
  const aiFile = document.getElementById("aiFile");
  const aiFolder = document.getElementById("aiFolder");
  if(aiFile){
    aiFile.addEventListener("change", async (e)=>{
      await addAttachments(Array.from(e.target.files));
      aiFile.value = "";
    });
  }
  if(aiFolder){
    aiFolder.addEventListener("change", async (e)=>{
      await addAttachments(Array.from(e.target.files));
      aiFolder.value = "";
    });
  }
}

async function addAttachments(files){
  const maxSize = 200000;
  for(const file of files){
    if(file.size > maxSize) continue;
    const content = await file.text();
    attachments.push({
      name: file.webkitRelativePath || file.name,
      content
    });
  }
  updateAttachInfo();
}

function updateAttachInfo(){

}

function setAnalysisVisible(show){
  const panel = document.querySelector(".analysis");
  if(!panel) return;
  panel.classList.toggle("hidden", !show);
}

function initAnalysisPanel(){
  const input = document.getElementById("actionUrl");
  const toggle = () => {
    const hasUrl = !!(input && input.value.trim());
    setAnalysisVisible(hasUrl);
  };
  if(input) input.addEventListener("input", toggle);
  toggle();
}
async function loadHistory(){
  const el = document.getElementById("history");
  if(!el) return;
  el.innerHTML = "";
  try{
    const res = await fetch(apiUrl("/api/chats"), { credentials:"include" });
    const chats = await res.json();
    chats.forEach(item => {
      const div = document.createElement("div");
      div.className = "nav-item";
      div.textContent = (item.prompt || "").slice(0, 40) || "(empty)";
      div.onclick = () => {
        document.getElementById("result").textContent = item.response || "";
      };
      el.appendChild(div);
    });
  }catch(e){
    el.textContent = "Failed to load";
  }
}

async function loadRepos(){
  const el = document.getElementById("repos");
  if(!el) return;
  el.innerHTML = "";
  try{
    const res = await fetch(apiUrl("/api/repos"), { credentials:"include" });
    const repos = await res.json();
    repos.forEach(item => {
      const div = document.createElement("div");
      div.className = "nav-item";
      div.textContent = item.repoId || item.repoUrl || "repo";
      div.onclick = async () => {
        currentRepoId = item.repoId;
        await loadRepoFiles();
        addLog("Repo selected: "+currentRepoId);
      };
      el.appendChild(div);
    });
  }catch(e){
    el.textContent = "Failed to load";
  }
}

async function runAI(mode){
  const code=editor.getValue();
  const userNote=(document.getElementById("userNote") || {}).value || "";

  let attachText = "";
  if(attachments.length>0){
    attachText = "\n\nAttached files:\n" + attachments.map(a => `--- ${a.name} ---\n${a.content}`).join("\n\n");
  }

  const prompt=mode+" this code:\n\n"+code+(userNote?"\n\nUser note:\n"+userNote:"")+attachText;

  addLog("Sent request: "+mode);
  document.getElementById("result").textContent="Thinking...";

  try{
    const response=await fetch(
      apiUrl("/ai"),
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        credentials:"include",
        body:JSON.stringify({prompt})
      }
    );

    const data=await response.json();
    document.getElementById("result").textContent=data.result || "No response";
    addLog("Response received");
    await loadHistory();
  }catch(e){
    document.getElementById("result").textContent="AI error: "+e;
    addLog("AI error");
  }
}

async function analyzeUrl(urlOverride){
  const inputEl = document.getElementById("analyzeUrl") || document.getElementById("actionUrl");
  const url = (urlOverride || (inputEl ? inputEl.value : "")).trim();
  const status = document.getElementById("analyzeStatus");
  const out = document.getElementById("analysisResult");
  if(!url){
    status.textContent = "URL missing";
    setAnalysisVisible(false);
    return;
  }
  status.textContent = "Analyzing...";
  out.textContent = "Working...";
  setAnalysisVisible(true);
  try{
    const res = await fetch(apiUrl("/api/analyze-url"), {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ url })
    });
    const data = await res.json();
    if(data.error){
      status.textContent = "Analyze failed";
      out.textContent = JSON.stringify(data, null, 2);
      addLog("Analyze failed: "+data.error);
      return;
    }
    status.textContent = "Done";
    out.textContent = JSON.stringify(data, null, 2);
    addLog("Analyzed: "+url);
  }catch(e){
    status.textContent = "Analyze error";
    out.textContent = String(e);
    addLog("Analyze error");
  }
}

function runCode(){
  const code=editor.getValue();
  const terminal=document.getElementById("terminal");

  try{
    const result=eval(code);
    terminal.textContent+="\n"+result;
    addLog("Code ran successfully");
  }catch(e){
    terminal.textContent+="\nError: "+e;
    addLog("Runtime error");
  }
}

async function cloneRepo(){
  const repoUrl = document.getElementById("repoUrl").value.trim();
  if(!repoUrl){
    addLog("Repo URL missing");
    return;
  }

  addLog("Cloning repo...");
  const res = await fetch(apiUrl("/api/repos/clone"), {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    credentials:"include",
    body:JSON.stringify({repoUrl})
  });
  const data = await res.json();
  if(data.error){
    addLog("Clone failed: "+data.error);
    return;
  }
  currentRepoId = data.repoId;
  await loadRepoFiles();
  addLog("Repo ready: "+(data.repoId || ""));
  await loadRepos();
}

async function loadRepoFiles(){
  if(!currentRepoId) return;
  const res = await fetch(apiUrl(`/api/repos/${currentRepoId}/files`), { credentials:"include" });
  const files = await res.json();
  const sidebar = document.getElementById("files");
  sidebar.innerHTML = "";
  files.forEach(file => {
    const div = document.createElement("div");
    div.textContent = file;
    div.className = "nav-item";
    div.onclick = () => openRepoFile(file);
    sidebar.appendChild(div);
  });
}

async function openRepoFile(path){
  if(!currentRepoId) return;
  const res = await fetch(apiUrl(`/api/repos/${currentRepoId}/file?path=${encodeURIComponent(path)}`), { credentials:"include" });
  const data = await res.json();
  if(data.error){
    addLog("Open failed: "+data.error);
    return;
  }
  editor.setValue(data.content || "");
  currentFilePath = data.path;
  addLog("Opened: "+currentFilePath);
}

async function saveFile(){
  if(!currentRepoId || !currentFilePath){
    addLog("No file selected");
    return;
  }
  const content = editor.getValue();
  const res = await fetch(apiUrl(`/api/repos/${currentRepoId}/file`), {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    credentials:"include",
    body:JSON.stringify({ path: currentFilePath, content })
  });
  const data = await res.json();
  if(data.error){
    addLog("Save failed: "+data.error);
    return;
  }
  addLog("Saved: "+currentFilePath);
}

async function pullRepo(){
  if(!currentRepoId){
    addLog("No repo selected");
    return;
  }
  addLog("Pulling...");
  const res = await fetch(apiUrl(`/api/repos/${currentRepoId}/pull`), {
    method:"POST",
    credentials:"include"
  });
  const data = await res.json();
  if(data.error){
    addLog("Pull failed: "+data.error);
    return;
  }
  addLog("Pull complete");
  await loadRepoFiles();
}

async function pushRepo(){
  if(!currentRepoId){
    addLog("No repo selected");
    return;
  }
  const message = document.getElementById("commitMsg").value.trim() || "Update from Codez AI";
  addLog("Pushing...");
  const res = await fetch(apiUrl(`/api/repos/${currentRepoId}/push`), {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    credentials:"include",
    body:JSON.stringify({ message })
  });
  const data = await res.json();
  if(data.error){
    addLog("Push failed: "+data.error);
    return;
  }
  addLog("Push complete");
}

function toggleTerminal(){
  const drawer = document.getElementById("terminalDrawer");
  if(!drawer) return;
  const isOpen = drawer.classList.contains("open");
  drawer.classList.toggle("open", !isOpen);
  drawer.setAttribute("aria-hidden", isOpen ? "true" : "false");
}

function openSettings(){
  addLog("Settings clicked");
}

async function cloneRepoUnified(){
  const input = document.getElementById("actionUrl");
  const repoUrl = (input && input.value || "").trim();
  if(!repoUrl){
    addLog("Repo URL missing");
    return;
  }

  addLog("Cloning repo...");
  const res = await fetch(apiUrl("/api/repos/clone"), {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    credentials:"include",
    body:JSON.stringify({repoUrl})
  });
  const data = await res.json();
  if(data.error){
    addLog("Clone failed: "+data.error);
    return;
  }
  currentRepoId = data.repoId;
  await loadRepoFiles();
  addLog("Repo ready: "+(data.repoId || ""));
  await loadRepos();
}

async function analyzeUrlUnified(){
  const input = document.getElementById("actionUrl");
  const url = (input && input.value || "").trim();
  if(!url){
    addLog("URL missing");
    return;
  }
  await analyzeUrl(url);
}

// Expose handlers for inline HTML onclick
window.runAI = runAI;
window.runCode = runCode;
window.loginGithub = loginGithub;
window.loginGoogle = loginGoogle;
window.logoutGithub = logoutGithub;
window.cloneRepo = cloneRepo;
window.pullRepo = pullRepo;
window.pushRepo = pushRepo;
window.saveFile = saveFile;
window.analyzeUrl = analyzeUrl;
window.toggleTerminal = toggleTerminal;
window.openSettings = openSettings;
window.cloneRepoUnified = cloneRepoUnified;
window.analyzeUrlUnified = analyzeUrlUnified;







