require.config({
paths:{vs:"https://unpkg.com/monaco-editor@0.45.0/min/vs"}
});

require(["vs/editor/editor.main"],function(){

window.editor=monaco.editor.create(
document.getElementById("editor"),
{
value:"",
language:"javascript",
theme:"vs-dark"
}
);

});

async function runAI(mode){

const code=editor.getValue();

const prompt=mode+" this code:\n\n"+code;

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

document.getElementById("result").textContent=data.result;

}

function runCode(){

const code=editor.getValue();

const terminal=document.getElementById("terminal");

try{

const result=eval(code);

terminal.textContent+="\n"+result;

}catch(e){

terminal.textContent+="\nError: "+e;

}

}

function loadProject(event){

const files=event.target.files;

const sidebar=document.getElementById("files");

sidebar.innerHTML="<b>Project Files</b>";

for(let file of files){

const div=document.createElement("div");

div.textContent=file.webkitRelativePath;

div.onclick=()=>openFile(file);

sidebar.appendChild(div);

}

}

function openFile(file){

const reader=new FileReader();

reader.onload=function(){

editor.setValue(reader.result);

};

reader.readAsText(file);

}
