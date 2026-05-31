# AssignMate

A mobile-first Progressive Web App (PWA) that helps students stay on top of their assignments. Built with React 19 + TypeScript + Vite. AI features are powered by Groq — no user account or API key setup required on the student side.

---

## Features

### 📋 Assignments
- Create, edit, and delete assignments with title, subject, details, due date, difficulty, estimated hours, priority, and grade
- Search assignments by title or subject
- Filter by All / Active / Completed / Overdue
- Swipe-to-delete with confirmation
- Import all assessments at once from a **subject outline PDF** — AI reads the PDF and extracts every assignment automatically

### 🤖 AI Analysis (per assignment)
- One-tap AI breakdown: plain-English explanation, auto-generated task checklist, and a day-by-day study plan up to the due date
- Upload a PDF or image of the assignment brief to auto-fill the details field
- Powered by Groq (`llama-3.3-70b-versatile` for text, `llama-4-scout-17b` for vision)

### ✅ Task Management
- AI generates tasks; you can add your own, edit, delete, or reorder them (▲ ▼ buttons)
- Check off tasks to automatically update assignment progress (0–100%)

### ⏱️ Study Timer (Pomodoro)
- Configurable work and break durations (defaults: 25 min work / 5 min break)
- After every 4 work sessions: automatic 15-minute long break
- Audio beep alert at session end (toggleable)
- Logs study minutes back to the assignment
- Session dots grouped in sets of 4 to visualise full Pomodoro cycles

### 📅 Calendar
- Month view with dots on every due date
- Tap a day to see all assignments due that day

### 📊 Stats
- Completion rate, total study hours logged, average grade, streak counter
- Assignment breakdown by difficulty and priority

### 🏠 Home Dashboard
- Streak badge, upcoming deadlines, overdue banner
- **Deadline cluster warning**: amber alert when 3+ assignments share the same 7-day window

### ⚙️ Settings
- Light / Dark theme
- Pomodoro work and break duration steppers
- Sound toggle for timer alerts
- Browser notification toggle (due-date reminders)
- JSON backup — download all your data; restore from a saved backup

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| State management | Zustand v5 |
| Routing | React Router v7 |
| PDF parsing | pdfjs-dist |
| Date utilities | date-fns |
| AI provider | Groq API |
| Deployment | Vercel (static + serverless) |

---

## Architecture — API Key Security

API keys **never** reach the browser. The flow:

```
Browser  →  POST /api/ai  →  [Proxy]  →  Groq API
                               ↑
                         Injects API key
                         (server-side only)
```

- **Development**: A Vite plugin (`vite.config.ts`) intercepts `POST /api/ai` in the dev server and forwards it to Groq using keys from `.env.local`.
- **Production**: `api/ai.ts` is a Vercel serverless function that reads keys from Vercel environment variables and forwards the request.

In both cases your `.env.local` / Vercel env vars are never shipped in the JS bundle.

### Round-robin key rotation

The proxy supports multiple Groq API keys and rotates through them automatically:

- **Dev (Vite plugin)**: true round-robin — counter persists for the whole dev session.
- **Production (Vercel)**: random key selection per request + automatic retry with the next key on a `429 Too Many Requests`.

This multiplies your effective rate limit. Three free Groq accounts × 30 req/min = **~90 req/min**.

---

## Project Structure

```
AssignMate/
├── api/
│   └── ai.ts                  # Vercel serverless proxy (POST /api/ai)
├── src/
│   ├── App.tsx                # Router, shell, bottom nav
│   ├── main.tsx
│   ├── index.css
│   ├── types/
│   │   └── index.ts           # Assignment, Task, AiResponse, AppSettings …
│   ├── constants/
│   │   └── index.ts           # DIFFICULTY_OPTIONS, ESTIMATED_HOURS_OPTIONS …
│   ├── utils/
│   │   └── index.ts           # formatDueDate, isOverdue, daysUntil …
│   ├── stores/
│   │   ├── assignmentStore.ts # Zustand: CRUD + localStorage persistence
│   │   ├── taskStore.ts       # Zustand: tasks + reorder
│   │   ├── settingsStore.ts   # Zustand: theme, timer config, notifications
│   │   ├── streakStore.ts     # Zustand: daily study streak
│   │   └── toastStore.ts      # Zustand: toast notifications
│   ├── services/
│   │   ├── ai.ts              # callAI(), analyzeAssignment(), extractAssignmentsFromOutline()
│   │   ├── fileExtractor.ts   # extractFromPdf(), extractFromImage()
│   │   ├── storage.ts         # localStorage helpers + exportAll/importAll
│   │   ├── notifications.ts   # Web Notifications API
│   │   └── calendar.ts        # iCal export helper
│   ├── screens/
│   │   ├── Home.tsx
│   │   ├── Assignments.tsx
│   │   ├── AssignmentForm.tsx
│   │   ├── AssignmentDetail.tsx
│   │   ├── ImportOutline.tsx
│   │   ├── StudyTimer.tsx
│   │   ├── Calendar.tsx
│   │   ├── Stats.tsx
│   │   └── Settings.tsx
│   ├── components/
│   │   ├── Icons.tsx
│   │   └── common/
│   │       ├── Badge.tsx
│   │       ├── Button.tsx
│   │       ├── EmptyState.tsx
│   │       ├── ErrorBoundary.tsx
│   │       ├── ProgressBar.tsx
│   │       └── Toast.tsx
│   └── hooks/
│       └── useSwipe.ts        # Swipe-to-delete gesture
├── .env.example               # Template — copy to .env.local
├── .env.local                 # Your real keys — gitignored (*.local)
├── vite.config.ts             # Dev proxy plugin + Vite config
├── vercel.json                # SPA rewrite + build config
├── tsconfig.json
└── package.json
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- A free [Groq account](https://console.groq.com) (takes 30 seconds)

### 1. Clone and install

```bash
git clone https://github.com/your-username/assignmate.git
cd assignmate
npm install
```

### 2. Configure API keys

Copy the example env file:
```bash
cp .env.example .env.local
```

Open `.env.local` and add your Groq key(s):

```env
# Single key (simplest)
GROQ_API_KEY_1=gsk_your_key_here

# Or multiple keys for higher throughput (recommended)
GROQ_API_KEY_1=gsk_key_from_account_one
GROQ_API_KEY_2=gsk_key_from_account_two
GROQ_API_KEY_3=gsk_key_from_account_three
```

> **Tip:** Create 2–4 free Groq accounts (different Google/email accounts work). Each gives you a separate rate-limit quota. The proxy rotates through them automatically.

### 3. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). You'll see in the terminal:
```
[groq-proxy] Loaded 3 API keys — round-robin active
```

---

## Deployment (Vercel)

### 1. Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Import on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Vercel auto-detects `vercel.json` — no config needed

### 3. Add environment variables

In **Vercel → Project → Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `GROQ_API_KEY_1` | `gsk_...` |
| `GROQ_API_KEY_2` | `gsk_...` *(optional)* |
| `GROQ_API_KEY_3` | `gsk_...` *(optional)* |

### 4. Deploy

Click **Deploy**. Your app is live — every student uses your hosted API keys; they never need to configure anything.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY_1` | Yes (if no `GROQ_API_KEY`) | First Groq API key |
| `GROQ_API_KEY_2` … `_10` | No | Additional keys for round-robin |
| `GROQ_API_KEY` | Fallback | Legacy single-key support |

All variables live in `.env.local` (dev) or Vercel dashboard (prod). They are **never** exposed to the browser.

---

## Data Models

### Assignment
```ts
{
  id: string              // UUID v4
  title: string
  subject: string
  details: string         // brief / instructions
  dueDate: string         // "YYYY-MM-DD"
  difficulty: 'easy' | 'medium' | 'hard'
  estimatedHours: number  // 2 | 5 | 10 | 20
  progress: number        // 0–100 (auto-calculated from tasks)
  priority?: 'urgent' | 'normal' | 'low'
  grade?: number          // 0–100, set after grading
  aiExplanation?: string
  aiStudyPlan?: string    // JSON: StudyPlanDay[]
  studyMinutes?: number   // logged via Study Timer
  createdAt: string       // ISO timestamp
}
```

### Task
```ts
{
  id: string
  assignmentId: string
  title: string
  completed: boolean
  dueDate?: string        // "YYYY-MM-DD", set by AI
  order?: number          // for manual reordering
}
```

---

## Capacity & Scaling

| Setup | Approximate capacity |
|---|---|
| 1 free Groq key | ~30 AI requests/min, ~500k tokens/day |
| 3 free keys (round-robin) | ~90 req/min |
| Groq paid plan | Unlimited (pay per token: ~$0.59/M) |

For a class of 30–50 students, **3 free keys** is more than sufficient. Each AI analysis uses roughly 800–1,200 tokens (~$0.0005 on paid).

If a key is rate-limited, the proxy automatically falls over to the next key — students never see an error.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with Groq proxy |
| `npm run build` | TypeScript check + Vite production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint |

---

## License

Vaibhav Singh Thapa
