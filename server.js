import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/ai", async (req, res) => {

const prompt = req.body.prompt;

const response = await fetch(
"https://openrouter.ai/api/v1/chat/completions",
{
method: "POST",
headers: {
"Content-Type": "application/json",
"Authorization": `Bearer ${process.env.OPENROUTER_KEY}`
},
body: JSON.stringify({
model: "deepseek/deepseek-chat",
messages: [
{ role: "user", content: prompt }
]
})
}
);

const data = await response.json();

res.json({
result: data.choices[0].message.content
});

});

app.listen(3000, () => {
console.log("Server running");
});
