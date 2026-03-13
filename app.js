require.config({
  paths:{vs:"https://unpkg.com/monaco-editor@0.45.0/min/vs"}
});

let currentRepoId = null;
let currentFilePath = null;
let attachments = [];

require(["vs/editor/editor.main"],function(){
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
});

function addLog(text){
  const log=document.getElementById("log");
  if(!log) return;
  const row=document.createElement("div");
  row.className="log-entry";
  row.innerHTML=`<span class="log-dot"></span><span>${new Date().toLocaleTimeString()} — ${text}</span>`;
  log.prepend(row);

  fetch("/api/logs", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    credentials:"include",
    body:JSON.stringify({message:text})
  }).catch(()=>{});
}

async function bootstrapAuth(){
  try{
    const res = await fetch("/api/me", { credentials:"include" });
    const user = await res.json();
    const status = document.getElementById("authStatus");
    const btn = document.getElementById("loginBtn");
    if(user && user.username){
      status.textContent = "@"+user.username;
      btn.textContent = "Logout";
      btn.onclick = logoutGithub;
      addLog("Logged in as "+user.username);
    }else{
      status.textContent = "Guest";
      btn.textContent = "GitHub Login";
      btn.onclick = loginGithub;
    }
  }catch(e){
    addLog("Auth check failed");
  }
}

function loginGithub(){
  window.location.href = "/auth/github";
}

async function logoutGithub(){
  await fetch("/api/logout", { method:"POST", credentials:"include" });
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
  const el = document.getElementById("attachInfo");
  if(!el) return;
  if(attachments.length===0){
    el.textContent = "No attachments";
  }else{
    el.textContent = attachments.length + " file(s) attached";
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
      "/ai",
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
  }catch(e){
    document.getElementById("result").textContent="AI error: "+e;
    addLog("AI error");
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
  const res = await fetch("/api/repos/clone", {
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
}

async function loadRepoFiles(){
  if(!currentRepoId) return;
  const res = await fetch(`/api/repos/${currentRepoId}/files`, { credentials:"include" });
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
  const res = await fetch(`/api/repos/${currentRepoId}/file?path=${encodeURIComponent(path)}`, { credentials:"include" });
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
  const res = await fetch(`/api/repos/${currentRepoId}/file`, {
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
  const res = await fetch(`/api/repos/${currentRepoId}/pull`, {
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
  const res = await fetch(`/api/repos/${currentRepoId}/push`, {
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

