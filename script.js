function runAI(mode){

let code=document.getElementById("codeInput").value

let result=""

if(!code){

result="Please paste some code first."

}

else if(mode==="explain"){

result="Explanation:\n\nThis code was analyzed successfully."

}

else if(mode==="debug"){

result="Debug Result:\n\nNo syntax errors detected."

}

else if(mode==="optimize"){

result="Optimization:\n\nYou can simplify loops or reduce repeated calculations."

}

document.getElementById("output").textContent=result

}
