require.config({
  paths:{vs:"https://unpkg.com/monaco-editor@0.45.0/min/vs"}
});

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
});

function addLog(text){
  const log=document.getElementById("log");
  if(!log) return;
  const row=document.createElement("div");
  row.className="log-entry";
  row.innerHTML=`<span class="log-dot"></span><span>${new Date().toLocaleTimeString()} — ${text}</span>`;
  log.prepend(row);
}

async function runAI(mode){
  const code=editor.getValue();
  const userNote=(document.getElementById("userNote") || {}).value || "";
  const prompt=mode+" this code:\n\n"+code+(userNote?"\n\nUser note:\n"+userNote:"");

  addLog("Sent request: "+mode);
  document.getElementById("result").textContent="Thinking...";

  try{
    const response=await fetch(
      "https://codez-ai-production.up.railway.app/ai",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
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

function loadProject(event){
  const files=event.target.files;
  const sidebar=document.getElementById("files");
  sidebar.innerHTML="";

  for(let file of files){
    const div=document.createElement("div");
    div.textContent=file.webkitRelativePath;
    div.className="nav-item";
    div.onclick=()=>openFile(file);
    sidebar.appendChild(div);
  }

  addLog("Loaded "+files.length+" files");
}

function openFile(file){
  const reader=new FileReader();
  reader.onload=function(){
    editor.setValue(reader.result);
    addLog("Opened: "+file.name);
  };
  reader.readAsText(file);
}
