// server.js  (Node.js 18+, ES modules -> set "type": "module" in package.json)
//
// Install:
//   npm init -y
//   npm pkg set type=module
//   npm install express groq-sdk dotenv zod pdf-parse@1.1.1
//
// .env file:
//   GROQ_API_KEY=your_key_here
//
// Run:  node server.js     (put my_resume.pdf next to this file)

import fs from "node:fs/promises";
import path from "node:path";

import "dotenv/config"; // same as load_dotenv() in Python
import cors from "cors"; // lets the frontend (another port) call this API
import express from "express"; // same role as FastAPI
import Groq from "groq-sdk";
import { z } from "zod"; // same role as Pydantic
import pdf from "pdf-parse/lib/pdf-parse.js"; // same role as pypdf

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const model = "openai/gpt-oss-120b";

const app = express();
app.use(cors());
app.use(express.json()); // lets us read JSON request bodies (req.body)

// ---------------------------------------------------------------------------
// Resume data models (Pydantic -> Zod)
// ---------------------------------------------------------------------------
const ExperienceSchema = z.object({
  company: z.string().nullable().default(null),
  role: z.string().nullable().default(null),
  duration: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  skills_used: z.array(z.string()).default([]),
});

const ResumeSchema = z.object({
  name: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),

  total_experience_years: z.number().nullable().default(null),

  skills: z.array(z.string()).default([]),
  experiences: z.array(ExperienceSchema).default([]),
  education: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
});

// Resume.model_json_schema() in Python -> z.toJSONSchema() in Zod v4
const resumeSchema = z.toJSONSchema(ResumeSchema);

// Request body: { "question": "..." }
const ChatRequestSchema = z.object({
  question: z.string(),
});

// ---------------------------------------------------------------------------
// Step 3: answer HR questions using the parsed resume
// ---------------------------------------------------------------------------
async function askCandidate(question, resume) {
  const systemPrompt = `
You are an AI assistant representing a job candidate.

Below is everything you know about the candidate.

${JSON.stringify(resume, null, 2)}

Content rules:

1. Answer only using this information.

2. Never hallucinate.

3. If information is unavailable,
say

"I don't have enough information to answer that."

4. Be professional.

5. Answer as if HR is interviewing this candidate.

Style rules:

1. Speak in the first person, as the candidate ("I have worked with...").

2. Write in plain text only. Do NOT use markdown: no asterisks, no bold,
   no headings, no bullet points, no numbered lists, no tables.

3. Write short, natural sentences in 2 to 5 sentences total.
   Do not list every item. Mention only the most relevant ones.

4. Do not use semicolons, long chains of commas, or special characters.
`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
  });

  return cleanText(response.choices[0].message.content);
}

// Safety net: even with good prompts, models sometimes slip in markdown.
// This removes leftover symbols so the reply looks clean in a chat window.
function cleanText(text) {
  return text
    .replace(/[\u2010-\u2015]/g, "-") // fancy hyphens -> normal hyphen
    .replace(/\*\*|__|`/g, "") // bold / code markers
    .replace(/^#{1,6}\s*/gm, "") // heading markers
    .replace(/^\s*[-*•]\s+/gm, "") // bullet markers at line start
    .replace(/\n{3,}/g, "\n\n") // collapse extra blank lines
    .trim();
}

// ---------------------------------------------------------------------------
// Step 2: turn raw resume text into structured JSON using the LLM
// ---------------------------------------------------------------------------
async function parseResume(resumeText) {
  const systemPrompt = `
    You are an expert resume parser.

    Extract information from the resume based on its meaning,
    not only based on exact section headings.

    Different resumes may use different headings.

    For example:
    - Experience
    - Professional Experience
    - Work History
    - Employment
    - Internships

    These may all contain relevant experience.

    Skills may also appear in the skills section, work experience,
    internships or projects.

    Return ONLY valid JSON matching this schema:

    ${JSON.stringify(resumeSchema, null, 2)}

    Important rules:

    1. Do not invent information.
    2. If a value is not available, return null.
    3. If a list has no information, return an empty list.
    4. Include internships inside experiences.
    5. Extract skills mentioned across the entire resume.
    `;

  const userPrompt = `
    Parse the following resume:

    ${resumeText}
    `;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await client.chat.completions.create({
    model,
    messages,
    response_format: { type: "json_object" }, // forces the model to output JSON
  });

  const rawOutput = response.choices[0].message.content;
  const data = JSON.parse(rawOutput); // json.loads in Python
  return ResumeSchema.parse(data); // Resume(**data): validates + fills defaults
}

// ---------------------------------------------------------------------------
// Step 1: PDF text extraction
// ---------------------------------------------------------------------------
async function readPdf(filePath) {
  const buffer = await fs.readFile(filePath);
  const result = await pdf(buffer); // pdf-parse handles all pages for us
  return result.text;
}

// ---------------------------------------------------------------------------
// Cache: parse the resume only once, reuse it for every question
// ---------------------------------------------------------------------------
let cachedResume = null;

async function getResume() {
  if (!cachedResume) {
    console.log("Parsing resume (first request only)...");
    const resumeText = await readPdf(path.resolve("my_resume.pdf"));
    cachedResume = await parseResume(resumeText);
  }
  return cachedResume;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  res.json({ message: "Ye home page hai" });
});

app.post("/chat", async (req, res) => {
  try {
    // Validate the body (FastAPI did this automatically via ChatRequest)
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: parsed.error.issues });
    }

    const resume = await getResume();
    const answer = await askCandidate(parsed.data.question, resume);

    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// Start server (FastAPI: `uvicorn main:app`)
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});