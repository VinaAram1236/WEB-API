// =============================================================================
// server.js — Quiz Generator API using Gemini/OpenAI/Anthropic
// =============================================================================
// HOW TO RUN:
//   1. npm install
//   2. Create a .env file with WEB_API_KEY and the provider key(s)
//   3. npm start
//   4. Call POST /api/generate-quiz with x-api-key and JSON body
// =============================================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_WEB_API_KEY = "LOCAL_DEV_KEY";
const WEB_API_KEY = process.env.WEB_API_KEY || DEFAULT_WEB_API_KEY;
const DEFAULT_AI_PROVIDER = process.env.AI_PROVIDER?.toLowerCase() || "openai";
const ALLOWED_AI_PROVIDERS = ["gemini", "openai", "anthropic"];

console.log('Loaded server config:');
console.log('  WEB_API_KEY=', WEB_API_KEY);
console.log('  AI_PROVIDER=', DEFAULT_AI_PROVIDER);
console.log('  GEMINI_API_KEY=', process.env.GEMINI_API_KEY ? 'set' : 'missing');
console.log('  OPENAI_API_KEY=', process.env.OPENAI_API_KEY ? 'set' : 'missing');
console.log('  ANTHROPIC_API_KEY=', process.env.ANTHROPIC_API_KEY ? 'set' : 'missing');

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // serves the test UI

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use gemini-1.5-flash — it's free and fast
const geminiModel = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",

  // JSON MODE: this tells Gemini to ONLY return valid JSON
  // so we can parse it directly without any cleanup
  generationConfig: {
    responseMimeType: "application/json",
  },
});

function verifyApiKey(req, res, next) {
  const requestKey = req.headers["x-api-key"] || req.query.api_key;
  if (!requestKey) {
    return res.status(401).json({
      error: "Invalid or missing API key. Provide x-api-key header with the server key or your OpenAI key.",
    });
  }

  const isServerKey = requestKey === WEB_API_KEY;
  const isOpenAIKey = requestKey.startsWith("sk-");

  if (!isServerKey && !isOpenAIKey) {
    return res.status(401).json({
      error: "Invalid API key. Provide your local server key or a valid OpenAI key.",
    });
  }

  req.openaiKeyFromRequest = isOpenAIKey ? requestKey : null;
  next();
}

function buildQuizPrompt(story, count) {
  return `You are a quiz generator. Read the text below and generate exactly ${count} multiple-choice questions.

TEXT:
"""
${story.trim()}
"""

Rules:
- Generate exactly ${count} questions.
- Base every question ONLY on information in the text above.
- Each question must have exactly 4 options.
- Only one option is the correct answer.
- Wrong answers should be plausible but clearly wrong based on the text.

Return a JSON object in EXACTLY this format:
{
  "total_questions": ${count},
  "questions": [
    {
      "id": 1,
      "question": "the question text here",
      "options": ["A) option one", "B) option two", "C) option three", "D) option four"],
      "correct_answer": "A"
    }
  ]
}
`;
}

async function generateQuizWithGemini(story, count) {
  const prompt = buildQuizPrompt(story, count);
  const result = await geminiModel.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text);
}

async function generateQuizWithOpenAI(story, count, openaiKey) {
  const effectiveKey = openaiKey || process.env.OPENAI_API_KEY;
  if (!effectiveKey || effectiveKey.trim().length === 0 || effectiveKey.startsWith("your_")) {
    throw new Error("OPENAI_API_KEY is not set or is a placeholder. Set a valid OpenAI key in .env or pass it via x-api-key.");
  }

  const prompt = buildQuizPrompt(story, count);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${effectiveKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a JSON-only quiz generator." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI request failed.");
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return JSON.parse(text);
}

async function generateQuizWithAnthropic(story, count) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey || anthropicKey.trim().length === 0 || anthropicKey.startsWith("your_")) {
    throw new Error("ANTHROPIC_API_KEY is not set or is a placeholder. Set a valid Anthropic key in .env.");
  }

  const prompt = buildQuizPrompt(story, count);
  const response = await fetch("https://api.anthropic.com/v1/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anthropicKey}`,
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-3.5",
      prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
      max_tokens_to_sample: 1000,
      temperature: 0.2,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Anthropic request failed.");
  }

  const text = data.completion;
  if (!text) {
    throw new Error("Anthropic returned an empty response.");
  }

  return JSON.parse(text);
}

async function generateQuiz(story, count, provider, openaiKey) {
  switch (provider) {
    case "openai":
      return generateQuizWithOpenAI(story, count, openaiKey);
    case "anthropic":
      return generateQuizWithAnthropic(story, count);
    default:
      return generateQuizWithGemini(story, count);
  }
}

// =============================================================================
// POST /api/generate-quiz
// Body: { story: string, question_count: number, provider?: string }
// =============================================================================
app.post("/api/generate-quiz", verifyApiKey, async (req, res) => {
  const { story, question_count, provider } = req.body;
  const selectedProvider = provider?.toLowerCase() || DEFAULT_AI_PROVIDER;

  if (!story || typeof story !== "string" || story.trim().length === 0) {
    return res.status(400).json({
      error: "Missing or empty 'story'. Please provide some text.",
    });
  }

  if (!question_count || typeof question_count !== "number" || question_count < 1) {
    return res.status(400).json({
      error: "Missing or invalid 'question_count'. Must be a positive number.",
    });
  }

  if (!ALLOWED_AI_PROVIDERS.includes(selectedProvider)) {
    return res.status(400).json({
      error: `Invalid provider '${selectedProvider}'. Supported providers: ${ALLOWED_AI_PROVIDERS.join(", ")}`,
    });
  }

  const count = Math.min(Math.floor(question_count), 20);

  try {
    return res.status(200).json((await generateQuiz(story, count, selectedProvider, req.openaiKeyFromRequest)));
  } catch (err) {
    console.error("AI provider error:", err.message || err);
    return res.status(500).json({
      error: "Failed to generate quiz: " + (err.message || "Unknown error."),
    });
  }
});

// =============================================================================
// GET /health — quick check to confirm server is running
// =============================================================================
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Quiz Generator API (Gemini) is running",
    time: new Date().toISOString(),
  });
});

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// =============================================================================
// START
// =============================================================================
app.listen(PORT, () => {
  console.log("============================================");
  console.log(`  Quiz API (Gemini) running on port ${PORT}`);
  console.log(`  UI:     http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log("============================================");
});
