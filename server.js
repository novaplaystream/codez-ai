import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import multer from "multer";

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const OPENAI_KEY = process.env.OPENAI_KEY;

app.post("/ai", async (req, res) => {

const prompt = req.body.prompt;

const response = await fetch(
"https://api.openai.com/v1/chat/completions",
{
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: `Bearer ${OPENAI_KEY}`
},
body: JSON.stringify({
model: "gpt-4o-mini",
messages: [
{
role: "user",
content: prompt
}
]
})
}
);

const data = await response.json();

res.json({
result: data.choices[0].message.content
});

});

app.post("/upload", upload.single("file"), (req,res)=>{
res.json({
file:req.file.filename
})
});

app.listen(3000,()=>{
console.log("Server running on port 3000");
});
