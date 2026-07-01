# AssignMate

A mobile-first Progressive Web App (PWA) that helps students stay on top of their assignments. Built with React 19 + TypeScript + Vite. AI features are powered by a configurable provider chain (OpenRouter, OpenAI, Gemini, or Groq) — no user account or API key setup required on the student side.

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
- Powered by whichever provider is configured (see [Provider priority](#provider-priority)) — a Llama-3.3-70B-class model for text, a vision-capable model for image extraction

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
| AI provider | OpenRouter / OpenAI / Gemini / Groq (first configured wins) |
| Deployment | Vercel (static + serverless) |

---

## Architecture — API Key Security

API keys **never** reach the browser. The flow:

```
Browser  →  POST /api/ai  →  [Proxy]  →  AI Provider
                               ↑
                         Injects API key
                         (server-side only)
```

- **Development**: A Vite plugin (`vite.config.ts`) intercepts `POST /api/ai` in the dev server and forwards it to the configured provider using keys from `.env.local`.
- **Production**: `api/ai.ts` is a Vercel serverless function that reads keys from Vercel environment variables and forwards the request.

In both cases your `.env.local` / Vercel env vars are never shipped in the JS bundle.

### Provider priority

Both the dev proxy and the production function check for keys in this order and use the **first provider that has at least one key configured**:

1. `OPENROUTER_API_KEY_1 … _N` → OpenRouter (unified gateway, `llama-3.3-70b-instruct`)
2. `OPENAI_API_KEY_1 … _N` → OpenAI (`gpt-4o-mini`)
3. `GEMINI_API_KEY_1 … _N` → Google Gemini (`gemini-3.5-flash`, 250k TPM free tier)
4. `GROQ_API_KEY_1 … _N` → Groq (`llama-3.3-70b-versatile`, 12k TPM free tier, 1,000 req/day cap)

Only set keys for **one** provider — mixing prefixes just means the higher-priority one wins and the rest sit unused. See [Choosing a provider at scale](#choosing-a-provider-at-scale) below for which one to pick.

### Round-robin key rotation

The proxy supports multiple keys for the active provider and rotates through them automatically:

- **Dev (Vite plugin)**: true round-robin — counter persists for the whole dev session.
- **Production (Vercel)**: random key selection per request + automatic retry with the next key on a `429 Too Many Requests`.

This multiplies your effective rate limit — e.g. three free Groq accounts × 30 req/min = **~90 req/min**.

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
├── android/                   # Capacitor native Android project
├── .env.example                # Template — copy to .env.local
├── .env.local                  # Your real keys — gitignored (.env*)
├── .env.android.example        # Template — copy to .env.android
├── .env.android                # Android-only: VITE_API_BASE_URL — gitignored
├── vite.config.ts             # Dev proxy plugin + Vite config
├── vercel.json                # SPA rewrite + build config
├── capacitor.config.ts        # Capacitor app config
├── tsconfig.json
└── package.json
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- An API key from **one** of: [OpenRouter](https://openrouter.ai/keys), [OpenAI](https://platform.openai.com/api-keys), [Google AI Studio](https://aistudio.google.com/apikey) (Gemini), or [Groq](https://console.groq.com)

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

Open `.env.local` and add key(s) for **one provider** (checked in this order — see [Choosing a provider at scale](#choosing-a-provider-at-scale)):

```env
# OpenRouter (recommended — best pooled throughput, see scale section below)
OPENROUTER_API_KEY_1=sk-or-your_key_here

# Or OpenAI
# OPENAI_API_KEY_1=sk-your_key_here

# Or Gemini
# GEMINI_API_KEY_1=your_key_here

# Or Groq (lowest free-tier throughput — fine for small classes only)
# GROQ_API_KEY_1=gsk_your_key_here

# Any provider: add _2, _3 … for multiple keys/accounts to round-robin through
```

> **Tip:** Multiple keys for the same provider (different accounts) each get their own rate-limit quota. The proxy rotates through them automatically.

### 3. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). You'll see in the terminal which provider was picked up, e.g.:
```
[ai-proxy] Using OpenRouter — 3 keys (llama-3.3-70b-instruct)
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

In **Vercel → Project → Settings → Environment Variables**, add keys for your chosen provider, e.g.:

| Name | Value |
|---|---|
| `OPENROUTER_API_KEY_1` | `sk-or-...` |
| `OPENROUTER_API_KEY_2` | `sk-or-...` *(optional)* |
| `OPENROUTER_API_KEY_3` | `sk-or-...` *(optional)* |

### 4. Deploy

Click **Deploy**. Your app is live — every student uses your hosted API keys; they never need to configure anything.

---

## Mobile (Android) Build

AssignMate ships as a native Android app via [Capacitor](https://capacitorjs.com), wrapping the same web build in a WebView with a few native bridges (local notifications, splash screen).

### 1. Point the app at your deployed backend

The native app has no local dev proxy to fall back on, so it needs your **deployed Vercel URL** (see [Deployment (Vercel)](#deployment-vercel) above) before it can make any AI call:

```bash
cp .env.android.example .env.android   # if you don't already have one
```

Edit `.env.android`:
```env
VITE_API_BASE_URL=https://your-app.vercel.app
```

Skipping this step doesn't fail loudly — every AI feature (Analyse, outline import, image OCR) will just silently error, because the app falls back to a same-origin relative `/api/ai` that resolves to nothing inside the packaged WebView.

### 2. Build and sync

```bash
npm run android:sync   # builds the web bundle in --mode android, then copies it into android/
npm run android:open   # opens the project in Android Studio
# or
npm run android:run    # builds, syncs, and installs to a connected device/emulator
```

Re-run `android:sync` any time you change app code or `.env.android`.

### 3. Notifications on Android

- The app requests `POST_NOTIFICATIONS` (Android 13+) the first time the user taps **Enable** on the first-launch prompt (see below) or the **Turn on Reminders** button in Settings — never automatically without that tap, per Android's permission model.
- Exact-alarm scheduling (so reminders fire at the precise time even if the app is closed) uses `USE_EXACT_ALARM` on Android 13+ (auto-granted for genuine reminder apps) and falls back to the `SCHEDULE_EXACT_ALARM` special-access toggle on Android 12.
- Reminders survive a reboot via `RECEIVE_BOOT_COMPLETED` (handled by the `@capacitor/local-notifications` plugin).

### 4. First-launch notification prompt

On first launch (web or Android), if the user hasn't yet decided on notification permission, a one-time friendly prompt explains why AssignMate wants to send reminders before triggering the OS permission dialog. Whatever the user chooses (enable / maybe later), the prompt won't show again — they can always change their mind later in **Settings → Reminders**.

### 5. Release signing (Play Store)

Not covered here — set up your release keystore either via Android Studio's **Build → Generate Signed Bundle / APK** wizard, or by adding a `signingConfig` to `android/app/build.gradle` backed by a **gitignored** `keystore.properties` (never commit a `.jks`/`.keystore` file — `android/.gitignore` already blocks this). Back the keystore up somewhere durable: losing it means you can never publish an update to the same app listing again.

---

## Environment Variables Reference

Set keys for **one** of these prefixes — the first one with a key wins (see [Provider priority](#provider-priority)):

| Variable | Provider | Description |
|---|---|---|
| `OPENROUTER_API_KEY_1` … `_10` | OpenRouter | Checked first |
| `OPENAI_API_KEY_1` … `_10` | OpenAI | Checked second |
| `GEMINI_API_KEY_1` … `_10` | Google Gemini | Checked third |
| `GROQ_API_KEY_1` … `_10` | Groq | Checked last |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` | — | Unsuffixed fallback if no `_1` is set for that provider |
| `VITE_API_BASE_URL` | — | Android build only (`.env.android`) — your deployed backend's origin, e.g. `https://your-app.vercel.app`. Empty/unset on web (uses relative `/api/ai`, same origin). |

All variables live in `.env.local` / `.env.android` (dev/build) or Vercel dashboard (prod). None of them are ever exposed to the browser bundle — `VITE_API_BASE_URL` is the one exception by design, since the client needs to know *where* to send requests (it contains no secret, just a hostname).

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

Every AI call in this app is a short, on-demand request (one analysis, one outline import, one image OCR) — not a persistent connection. So "1,000 concurrent users" doesn't mean 1,000 simultaneous open connections to the AI provider; it means the proxy needs to absorb bursts of requests-per-minute, worst case everyone tapping "Analyse" in the same few minutes (e.g. a lecturer telling a 1,000-student cohort to import their outline right now). Plan around **RPM / TPM headroom**, not raw concurrency.

### Provider capacity (current, per key/project — verified 2026-07)

| Provider | Free tier | Paid tier | Price / 1M tokens |
|---|---|---|---|
| **Groq** | 30 RPM, 12k TPM, **1,000 req/day cap** | Developer tier (free, just add a card): ~10x limits, 1,000 RPM | $0.59 in / $0.79 out (llama-3.3-70b) |
| **Gemini** (3.5 Flash) | 10 RPM, 250k TPM, 1,500 req/day — **capped per Google Cloud *project*, not per key** | Tier 1: 150–300 RPM · Tier 2 (>$250 spend): 1,000+ RPM | $1.50 in / $9.00 out |
| **OpenAI** (gpt-4o-mini) | — (paid only) | Tier 1 (after $5 paid): 500 RPM, 2M TPM · Tier 2 (after $50 spent): 5,000 RPM, 4M TPM | $0.15 in / $0.60 out |
| **OpenRouter** | `:free` model variants: 20 RPM, 50–1,000 req/day | Paid (non-`:free`) models: **no OpenRouter-side rate cap** — limited only by the underlying provider it routes to | Pass-through + small margin |

### Choosing a provider at scale

For a small class (30–50 students), free-tier round-robin (2–4 Groq or OpenRouter keys) is fine — that's what this repo defaults to.

**For 1,000+ concurrent students, don't rely on stacked free keys:**
- Groq's free tier caps at **1,000 requests/day per key** — a single busy day burns through it regardless of RPM, and stacking personal free accounts for a production app is fragile and against the spirit of the free tier.
- Gemini's free-tier request cap is enforced **per Google Cloud project**, not per API key — creating multiple keys under one project does **not** multiply your quota the way it does for Groq/OpenRouter.

**Recommended: switch the primary provider to OpenAI (`gpt-4o-mini`) on a paid account.**
- A single Tier 1 key (unlocked after a one-time $5 top-up) gives 500 RPM / 2M TPM — already comfortably above any realistic burst this app would see from 1,000 students. Tier 2 (reached automatically after $50 total spend) gives 5,000 RPM / 4M TPM.
- It's the cheapest per-token option of the four ($0.15 in / $0.60 out) and has the most reliable structured-JSON output, which matters here since every AI call in this app (`analyzeAssignment`, `extractAssignmentsFromOutline`) depends on getting back strict, well-formed JSON.
- Estimated real-world cost at 1,000 active students × ~3 AI calls/day × ~1,800 tokens/call ≈ 5.4M tokens/day → roughly **$60–90/month**, with no key-juggling required.
- To switch: just set `OPENAI_API_KEY_1` in `.env.local` / Vercel and remove/leave-unset `OPENROUTER_API_KEY_*` (OpenRouter is checked first and would otherwise win).

**Alternative:** keep OpenRouter as the entry point (it's already priority #1 in the code) but fund the account with real prepaid credit and route to non-`:free` models — this removes OpenRouter's own rate cap entirely. It adds one extra network hop and a small margin over the underlying model's price, but requires no code change.

If a key/provider is rate-limited or briefly unreachable, the proxy automatically retries the next configured key — students never see a raw error.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with AI proxy |
| `npm run build` | TypeScript check + Vite production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint |

---

## License

Vaibhav Singh Thapa
