async function askAI(){

const prompt = document.getElementById("prompt").value;

const response = await fetch(
"https://codez-ai-production.up.railway.app/ai",
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
prompt:prompt
})
}
);

const data = await response.json();

document.getElementById("result").textContent =
data.result;

}
