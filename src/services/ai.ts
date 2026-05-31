import type { AiResponse, Assignment, OutlineParseResult } from '../types';
import { getDaysUntilDue, todayStr } from '../utils';

/**
 * All AI calls go through our own /api/ai proxy endpoint.
 *
 * In development: the Vite plugin in vite.config.ts intercepts this route,
 *   reads GROQ_API_KEY from .env.local, and forwards the request to Groq.
 *
 * In production (Vercel): api/ai.ts is a serverless function that does the same
 *   using the GROQ_API_KEY environment variable set in the Vercel dashboard.
 *
 * The API key NEVER reaches the browser.
 */
const API_URL = '/api/ai';
const MODEL   = 'llama-3.3-70b-versatile';

/* ── Shared fetch helper ─────────────────────────────────────────── */

type GroqPayload = {
  model: string;
  temperature: number;
  max_tokens: number;
  response_format?: { type: 'json_object' };
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: unknown }>;
};

async function callAI(payload: GroqPayload): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    /* Handle both our proxy error shape { error: "string" }
       and Groq's native error shape { error: { message: "..." } } */
    type ErrBody = { error?: string | { message?: string } };
    const body = await res.json().catch(() => ({})) as ErrBody;
    const msg =
      typeof body.error === 'string'
        ? body.error
        : (body.error?.message ?? `AI service error ${res.status}`);
    throw new Error(msg);
  }

  type GroqResponse = { choices: Array<{ message: { content: string } }> };
  const data = (await res.json()) as GroqResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from AI.');
  return content;
}

/* ── Prompts ─────────────────────────────────────────────────────── */

const SYSTEM_PROMPT =
  'You are an academic assistant that helps students plan their assignments. ' +
  'Always respond with valid JSON only. Do not include markdown, code fences, or any text outside the JSON object.';

function buildUserPrompt(assignment: Assignment): string {
  const days = getDaysUntilDue(assignment.dueDate);
  const maxOffset = Math.max(days - 1, 0);
  return `I have an assignment with these details:
Title: ${assignment.title}
Subject: ${assignment.subject}
Details: ${assignment.details || 'No additional details provided.'}
Due in: ${days} day(s) (today is ${todayStr()})
Difficulty: ${assignment.difficulty}
Estimated effort: ${assignment.estimatedHours} hours

Generate a JSON object with EXACTLY this structure:
{
  "explanation": "Plain-English explanation under 150 words for a student.",
  "tasks": [
    { "title": "Specific actionable task", "dueDateOffset": 2 }
  ],
  "studyPlan": [
    { "date": "YYYY-MM-DD", "tasks": ["Task A", "Task B"] }
  ]
}

Rules:
- "explanation" under 150 words.
- "tasks": 3–7 specific items. "dueDateOffset" = integer days from today (0=today, max ${maxOffset}).
- "studyPlan": one entry per day from today through due date; 1–3 tasks per day, evenly spread.
- All dates in YYYY-MM-DD format.
- No text outside the JSON object.`;
}

const OUTLINE_SYSTEM =
  'You are an academic assistant that extracts assessment details from university subject outlines. ' +
  'Always respond with valid JSON only. No markdown, no code fences, no text outside the JSON.';

function buildOutlinePrompt(text: string): string {
  const textSlice = text.slice(0, 22000);

  return `Extract only the formally assessed items from this university subject outline. Today is ${todayStr()}.

CRITICAL INSTRUCTIONS — READ CAREFULLY:

STEP 1 — Find the FORMAL ASSESSMENT TABLE:
- Look for a section titled "Assessment Information", "Assessment Details", "Assessment Summary", or "Section 3".
- This section contains a TABLE with columns like: Assessment Number, Assessment Title/Type, Weight (%), Due Date.
- This is the ONLY source of truth for assessments. There are typically 3–6 items in this table.
- IGNORE the "Weekly Schedule", "Teaching Schedule", or "Weekly Planner" section — it is NOT the source.

STEP 2 — What to INCLUDE:
- Only items explicitly listed in the formal assessment table (with a weight % including 0%).
- Quizzes, assignments, reports, essays, group projects, presentations listed in that table.

STEP 3 — What to EXCLUDE (these are NOT assessments):
- Weekly lectures, tutorials, lab sessions, workshops, seminars.
- Readings, textbook chapters, pre-reading tasks.
- Any item not listed in the formal assessment table.
- Generic entries like "Study for exam", "Attend lecture", "Review material".

STEP 4 — Compute due dates:
- Find the Week 1 start date from the document (look for phrases like "Classes commence", "Week 1 commences", or a date next to "Week 1").
- Each week runs Monday–Sunday. Week N starts on Monday of (Week 1 start + (N-1) × 7 days).
- "Due Week N" or "Due end of Week N" = Sunday of that week.
- "Due Monday Week N" or "9am Monday Week N" = Monday of that week.
- "In class Week N" or "In workshop Week N" = Friday of that week.
- If an explicit date (e.g. "28 April 2026") is given, use that directly.
- If no date/week is given for an item, use the last day of the trimester (approx Week 12 Sunday).

STEP 5 — For each assessment, look for a DETAILED DESCRIPTION section immediately following the summary table.
These pages describe word limits, submission methods, learning outcomes, and specific requirements. Use this text for the "details" field.

Return ONLY a JSON object with this exact structure (no extra keys, no markdown):
{
  "subject": "Full subject code and name as written in the document (e.g. ICT711 Programming and Algorithms)",
  "assignments": [
    {
      "title": "Exact assessment name as listed in the formal table",
      "details": "Up to 4 sentences: what the student must produce, word/time limit, submission method, key requirements. Use the detailed description pages if available.",
      "dueDate": "YYYY-MM-DD",
      "difficulty": "easy|medium|hard",
      "estimatedHours": 5,
      "weight": "25%"
    }
  ]
}

Difficulty guide:
- easy   → quiz, short in-class test, formative activity (≤10%)
- medium → group report, presentation, medium written task (1000–2000w)
- hard   → major individual essay/report (≥2000w), complex project

EstimatedHours guide:
- 2  → quiz or short test
- 5  → short assignment (≤1500 words or simple deliverable)
- 10 → medium report/presentation (1500–2500 words or group project)
- 20 → major report or project (≥2500 words)

Subject outline text:
${textSlice}`;
}

/* ── Public API ──────────────────────────────────────────────────── */

export async function extractAssignmentsFromOutline(
  outlineText: string,
): Promise<OutlineParseResult> {
  const content = await callAI({
    model:           MODEL,
    temperature:     0.1,
    max_tokens:      3000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: OUTLINE_SYSTEM },
      { role: 'user',   content: buildOutlinePrompt(outlineText) },
    ],
  });

  const result = JSON.parse(content) as OutlineParseResult;
  if (!result.assignments?.length) throw new Error('No assignments found in this document.');
  return result;
}

export async function analyzeAssignment(assignment: Assignment): Promise<AiResponse> {
  const content = await callAI({
    model:           MODEL,
    temperature:     0.3,
    max_tokens:      1200,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildUserPrompt(assignment) },
    ],
  });

  return JSON.parse(content) as AiResponse;
}
