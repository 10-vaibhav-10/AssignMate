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
 *
 * On Android (Capacitor): VITE_API_BASE_URL is set to the deployed Vercel URL
 * in .env.android so the app calls https://your-app.vercel.app/api/ai.
 * On web: VITE_API_BASE_URL is empty → relative URL /api/ai (same origin).
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const API_URL  = `${API_BASE}/api/ai`;

// 70B for per-assignment analysis (complex reasoning, smaller prompt → fast enough)
const MODEL      = 'llama-3.3-70b-versatile';
// 8B-instant for outline extraction (structured extraction only, runs ~8× faster → fits Vercel's limit)
const MODEL_FAST = 'llama-3.1-8b-instant';

/* ── Shared fetch helper ─────────────────────────────────────────── */

type GroqPayload = {
  model: string;
  temperature: number;
  max_tokens: number;
  response_format?: { type: 'json_object' };
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: unknown }>;
};

async function callAI(payload: GroqPayload): Promise<string> {
  // 90-second timeout — Vercel functions run up to 60 s; the extra 30 s covers
  // cold-start overhead and network round-trips between browser → Vercel → Groq.
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 90_000);

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('AI request timed out. Please try again — it usually works on the second attempt.');
    }
    throw new Error('Could not reach the AI service. Check your internet connection and try again.');
  }
  clearTimeout(timeoutId);

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
  // With Gemini as primary provider (1 M TPM free tier) we can read a much larger
  // slice — enough to capture the Weekly Planner, assessment table AND Section 3
  // detailed descriptions in one shot.
  // Groq fallback (6 k TPM): ~3 000 chars of instructions ≈ 750 tokens
  //   + 12 000 chars of text ≈ 3 000 tokens + max_tokens 1 500 = 5 250 TPM ✓
  const textSlice = text.slice(0, 12000);

  return `Extract every formally assessed item from this university subject outline. Today is ${todayStr()}.

━━━ DOCUMENT STRUCTURE (KOI / King's Own Institute format) ━━━

The document has THREE sections you must use together:

A) WEEKLY PLANNER (Section 2.4 "Subject Content and Structure")
   A table with columns: Week (beginning) | Topics | Readings | Expected Work
   • Each row starts with the week NUMBER and its CALENDAR START DATE,
     e.g. "Week 5  30 March" or "Week 5 / 30 March".
   • The "Expected Work" column contains BOLD due-date markers such as:
       "Assessment 2: Quiz due"
       "Assignment 1 Due Sunday 11:59 pm"
       "Assessment 4: Database Privacy and Ethics Report due by Tuesday 9am"
       "Assessment 2: Demo … conducted in workshop class"
   ★ USE THESE MARKERS to determine the exact due date for each assessment.

B) FORMAL ASSESSMENT TABLE (Section 2.8 "Student Assessment" or "Student Assignment")
   Columns: Assessment/Assignment Type | When Assessed | Weighting | Learning Outcomes
   • This is the DEFINITIVE LIST. Include EVERY row, including formative 0% items.
   • "When Assessed" gives the week number(s) — cross-reference with the Weekly Planner.

C) ASSESSMENT DETAILS (Section 3 "Assessment Details" or "Assignment Details")
   • Detailed per-assessment descriptions: word limits, submission method, deliverables.
   • Use these for the "details" field of each assignment.

━━━ HOW TO CALCULATE EXACT DUE DATES ━━━

Step 1 — Find Week 1 start date from the Weekly Planner row labelled "Week 1".
Step 2 — Week N start date = Week1Date + (N-1) × 7 days.
Step 3 — Apply the rule that matches the bold marker in the Weekly Planner:

  "Due Sunday 11:59 pm" in Week N row        → Week N start + 6 days (Sunday)
  "Sunday midnight Week N"                   → Week N start + 6 days (Sunday)
  "Due by Tuesday [time] Week N"             → Week N start + 1 day  (Tuesday)
  "In class Week N" / "In workshop Week N"   → Week N start           (Monday)
  "Quiz" / "Test" in Week N row              → Week N start           (Monday)
  Explicit calendar date (e.g. "28 April")   → use that date directly
  Multi-week range "Weeks M–N"               → Week N start + 4 days  (Friday of last week)
  No marker found                            → Week N start + 6 days  (Sunday, conservative)

━━━ SUBJECT NAME ━━━

• Use format: "SUBJECTCODE Full Name in Title Case"
• Example: "ICT711 Programming and Algorithms"  (NOT "ICT711 PROGRAMMING AND ALGORITHMS T126")
• Strip the trimester code (T126, T226, etc.) from the name.

━━━ WHAT TO INCLUDE vs EXCLUDE ━━━

INCLUDE: Every row in the Section 2.8 formal table — quizzes, reports, projects,
presentations, formative items (0% weight). Each is a separate assignment.

EXCLUDE: Weekly tutorial exercises listed in the planner, review questions,
"Summative graded" session activities, lecture prep, readings.

━━━ OUTPUT FORMAT ━━━

Return ONLY valid JSON — no markdown, no code fences, nothing outside the object:
{
  "subject": "SUBJECTCODE Full Subject Name",
  "assignments": [
    {
      "title": "Exact name from Section 2.8 formal table",
      "details": "2–3 sentences from Section 3: what to submit, word/time limit, submission method, key requirements.",
      "dueDate": "YYYY-MM-DD",
      "difficulty": "easy|medium|hard",
      "estimatedHours": 2,
      "weight": "25%"
    }
  ]
}

Difficulty:  easy = formative/quiz/short in-class test | medium = 1 000–2 000w report or presentation | hard = 2 000w+ report, group project with code/implementation, major individual project
EstimatedHours: 2 = quiz/test | 5 = short report ≤1 500w | 10 = medium 1 500–2 500w or group work | 20 = major project or report ≥2 500w

Subject outline text:
${textSlice}`;
}

/* ── Public API ──────────────────────────────────────────────────── */

export async function extractAssignmentsFromOutline(
  outlineText: string,
): Promise<OutlineParseResult> {
  const content = await callAI({
    model:           MODEL_FAST,  // 8B-instant: ~8× faster, fits within Vercel's 60 s limit
    temperature:     0.1,
    max_tokens:      1500,        // 5–6 assignments with rich details needs ~800–1200 tokens; 1500 is safe
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
