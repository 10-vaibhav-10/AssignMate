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

// 70B for per-assignment analysis AND outline extraction (complex date math needs smarter model)
const MODEL      = 'llama-3.3-70b-versatile';
// 8B-instant kept as a constant for reference; outline extraction now uses the full model
const MODEL_FAST = 'llama-3.1-8b-instant';
void MODEL_FAST; // suppress unused-variable warning

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
      throw new Error('AI request timed out. Please try again ! It usually works on the second attempt.');
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

/**
 * Smart section extractor for KOI (King's Own Institute) subject outlines.
 *
 * Problem with naive text.slice(0, 12000):
 *   • Includes noisy Weekly Planner rows ("Summative graded", "Discussion on Java…")
 *     every week, which the AI mistakenly treats as assessments.
 *   • Often misses Section 3 (pages 11–17) which has the actual per-assessment
 *     details, word limits, and submission instructions.
 *
 * This function instead surgically extracts three labelled sections:
 *   A. Weekly Planner   — Week 1 calendar date + per-week due-date markers
 *   B. Section 2.8      — formal assessment table (definitive list)
 *   C. Section 3        — per-assessment details, word limits, submission method
 *
 * Character budget (safe for Groq 6 k TPM fallback):
 *   Planner 4 500 + Table 2 500 + Details 6 000 = 13 000 chars ≈ 3 250 tokens
 *   + prompt instructions ≈ 750 tokens + max_tokens 2 000 = 6 000 TPM ✓
 */
function extractRelevantSections(fullText: string): string {
  const len = fullText.length;

  /** Return the index of the first regex match, or -1 if none match. */
  function findSection(patterns: RegExp[]): number {
    let best = len;
    for (const pat of patterns) {
      const m = pat.exec(fullText);
      if (m && m.index < best) best = m.index;
    }
    return best < len ? best : -1;
  }

  // ── Locate section boundaries ──────────────────────────────────────

  // Section A: Weekly Planner — starts at the table column-header row
  const plannerIdx = findSection([
    /week\s*\(\s*beginning\s*\)/i,          // "Week (beginning)  Topics  Readings  Expected Work"
    /2\.4\s+subject\s+content/i,            // "2.4 Subject Content and Structure"
    /subject\s+content\s+and\s+structure/i,
  ]);

  // Section B: Formal Assessment Table (Section 2.8)
  const tableIdx = findSection([
    /2\.8\s+student\s+(assessment|assignment)/i,     // "2.8 Student Assessment"
    /student\s+assignment\s+table/i,
    /assessment\s*\/\s*assignment\s+type\s+when\s+assessed/i,
    /assignment\s*\/\s*formative\s+task\s+when\s+assessed/i, // BUS709 header
  ]);

  // Section C: Per-assessment details (Section 3)
  const detailsIdx = findSection([
    /\b3\s+assessment\s+details\b/i,         // "3 Assessment Details"
    /\b3\s+assignment\s+details\b/i,          // "3 Assignment Details" (BUS709)
    /\bassessment\s+details\s+and\s+criteria\b/i,
    /\b3\.1\b.{0,50}(assessment|assignment)\s+\d/i, // "3.1 Assessment 1"
  ]);

  // ── Slice each section ────────────────────────────────────────────

  const parts: string[] = [];

  if (plannerIdx !== -1) {
    // Planner ends where the formal table begins (or after 4 500 chars)
    const end = (tableIdx !== -1 && tableIdx > plannerIdx)
      ? Math.min(plannerIdx + 4500, tableIdx)
      : plannerIdx + 4500;
    parts.push(
      '=== SECTION A: WEEKLY PLANNER ===\n' +
      fullText.slice(plannerIdx, end),
    );
  }

  if (tableIdx !== -1) {
    // Table ends where Section 3 begins (or after 2 500 chars)
    const end = (detailsIdx !== -1 && detailsIdx > tableIdx)
      ? Math.min(tableIdx + 2500, detailsIdx)
      : tableIdx + 2500;
    parts.push(
      '=== SECTION B: FORMAL ASSESSMENT TABLE (Section 2.8) ===\n' +
      fullText.slice(tableIdx, end),
    );
  }

  if (detailsIdx !== -1) {
    // Section 3 gets the most space — up to 6 000 chars of detailed descriptions
    parts.push(
      '=== SECTION C: ASSESSMENT DETAILS (Section 3) ===\n' +
      fullText.slice(detailsIdx, detailsIdx + 6000),
    );
  }

  if (parts.length === 0) {
    // Fallback: if no KOI section patterns matched, use a naive slice
    return fullText.slice(0, 12000);
  }

  return parts.join('\n\n');
}

function buildOutlinePrompt(text: string): string {
  const extracted = extractRelevantSections(text);

  return `Extract every formally assessed item from this university subject outline. Today is ${todayStr()}.

The text below has been pre-extracted into up to three labelled sections:

  SECTION A - WEEKLY PLANNER: Contains the Week 1 calendar date and, for each week row,
    an "Expected Work" entry that states when each assessment is due (e.g. "Assessment 2:
    Quiz due", "Assignment 1 Due Sunday 11:59 pm"). Use this ONLY for dates — ignore all
    lecture topics, readings, tutorial activities, and "Summative graded" entries.

  SECTION B - FORMAL ASSESSMENT TABLE (Section 2.8): The DEFINITIVE LIST of all assessed
    items. Each row is one assignment. Use ONLY the rows in this table to decide which
    assessments exist. Do NOT invent assessments not listed here.

  SECTION C - ASSESSMENT DETAILS (Section 3): Detailed per-assessment descriptions —
    word limits, deliverables, submission method. Use these for the "details" field.

━━━ SUBJECT NAME ━━━
• Format: "SUBJECTCODE Full Name in Title Case"  e.g. "ICT711 Programming and Algorithms"
• Strip trimester codes (T126, T226, etc.) from the name.

━━━ WHICH ASSESSMENTS TO INCLUDE ━━━
INCLUDE: Every row in SECTION B - quizzes, reports, projects, presentations, group work,
formative items (0% weight). Each row = one assignment object in the output.

EXCLUDE: Anything NOT in Section B - weekly readings, tutorial prep, lecture activities,
"Summative graded" sessions, "Discussion on…" entries, review questions.

━━━ CALCULATING EXACT DUE DATES ━━━

Step 1 - In SECTION A, find the row for "Week 1" and read its calendar date
         (e.g. "Week 1  2 March 2026" → Week 1 starts 2 March 2026).
Step 2 - Week N start date = Week1StartDate + (N − 1) × 7 days.
Step 3 - Find this assessment's row in SECTION A "Expected Work" column, then apply:

  Marker in Section A row                              → Due date
  ─────────────────────────────────────────────────────────────────
  "Due Sunday 11:59 pm" / "Sunday midnight" (Week N)  → Week N start + 6 days
  "Due by Tuesday [time]" (Week N)                    → Week N start + 1 day
  "Due by Monday [time]" / "Monday 9am" (Week N)      → Week N start + 0 days
  "In class" / "in workshop" / "Quiz" (Week N)        → Week N start + 0 days
  "Demo … conducted in workshop" (Week N)             → Week N start + 0 days
  Explicit calendar date anywhere (e.g. "28 April")  → use that date directly
  "Weeks M–N" range                                   → Week N start + 6 days (Sunday)
  No marker found                                     → Week N start + 6 days (Sunday)

━━━ DETAILS FIELD ━━━
Write 2–3 sentences from SECTION C covering: what to submit, word/time limit,
submission method, key deliverables. If Section C has no entry for an item,
write a brief description inferred from Section B.

━━━ OUTPUT FORMAT ━━━
Return ONLY valid JSON - no markdown, no code fences, nothing outside the object:
{
  "subject": "SUBJECTCODE Full Subject Name",
  "assignments": [
    {
      "title": "Exact name from Section B",
      "details": "2–3 sentences from Section C.",
      "dueDate": "YYYY-MM-DD",
      "difficulty": "easy|medium|hard",
      "estimatedHours": 2,
      "weight": "25%"
    }
  ]
}

Difficulty:
  easy   = formative quiz, short in-class test, attendance task
  medium = report/essay 1 000–2 000 w, presentation, group demo
  hard   = report/project 2 000 w+, major group project with code, individual capstone

EstimatedHours:
  2  = quiz or short in-class test
  5  = short report ≤ 1 500 w or short presentation
  10 = medium report 1 500–2 500 w, group project, or demo
  20 = major individual project or report ≥ 2 500 w

Subject outline text (pre-extracted sections):
${extracted}`;
}

/* ── Public API ──────────────────────────────────────────────────── */

export async function extractAssignmentsFromOutline(
  outlineText: string,
): Promise<OutlineParseResult> {
  const content = await callAI({
    model:           MODEL,        // 70B: better date arithmetic and section reasoning
    temperature:     0.1,
    max_tokens:      2000,         // up to 7 assessments with rich details needs ~1 500–1 800 tokens
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
