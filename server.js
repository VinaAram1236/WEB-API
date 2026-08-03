const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function buildQuestion(sentence, allSentences) {
  const correct = sentence.trim();
  const candidates = allSentences.filter((s) => s.trim() && s.trim() !== correct);
  const distractors = candidates
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((s) => s.trim());

  const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
  const correctIndex = options.indexOf(correct);

  return {
    question: "Which of these statements is true according to the story?",
    options: options.map((opt) => opt.slice(0, 120)),
    correct_answer: ["A", "B", "C", "D"][correctIndex],
    hint: "This answer is a sentence directly taken from the story.",
  };
}

function makeQuiz(story, count) {
  const sentences = story
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  if (sentences.length === 0) {
    return null;
  }

  const questions = [];
  for (let i = 0; i < count; i += 1) {
    const sentence = sentences[i % sentences.length];
    questions.push({
      id: i + 1,
      ...buildQuestion(sentence, sentences),
    });
  }

  return {
    total_questions: questions.length,
    questions,
  };
}

app.post("/api/generate-quiz", (req, res) => {
  const { story, question_count } = req.body;
  if (!story || typeof story !== "string") {
    return res.status(400).json({ error: "Please provide story text." });
  }

  const count = Number.isInteger(question_count)
    ? Math.max(1, Math.min(10, question_count))
    : 3;

  const quiz = makeQuiz(story, count);
  if (!quiz) {
    return res.status(400).json({ error: "Story must contain at least one full sentence." });
  }

  return res.json(quiz);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
