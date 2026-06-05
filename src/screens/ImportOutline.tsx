import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../stores/assignmentStore';
// Note: useAssignmentStore.getState() is used after addAssignment calls
import { extractFromPdf, extractFromImage } from '../services/fileExtractor';
import { extractAssignmentsFromOutline } from '../services/ai';
import { formatDueDate } from '../utils';
import { rescheduleAll } from '../services/notifications';
import { DifficultyBadge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { ChevronLeftIcon, DocumentArrowUpIcon, SparklesIcon, CheckIcon } from '../components/Icons';
import type { ExtractedAssignment, Difficulty } from '../types';

type Step = 'upload' | 'extracting' | 'analyzing' | 'ratelimit' | 'review' | 'error';

const RETRY_SECS = 65; // slightly over 60 s so the per-minute window definitely resets

export default function ImportOutline() {
  const navigate = useNavigate();
  const addAssignment = useAssignmentStore((s) => s.add);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const countdownRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingTextRef = useRef<string | null>(null);  // PDF text saved for auto-retry

  const [step,      setStep]      = useState<Step>('upload');
  const [error,     setError]     = useState<string | null>(null);
  const [subject,   setSubject]   = useState('');
  const [extracted, setExtracted] = useState<ExtractedAssignment[]>([]);
  const [selected,  setSelected]  = useState<Set<number>>(new Set());
  const [adding,    setAdding]    = useState(false);
  const [countdown, setCountdown] = useState(0);

  /* Clean up countdown timer on unmount */
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  /* ── Core logic ──────────────────────────────────────────────── */

  function startCountdown(onDone: () => void) {
    setCountdown(RETRY_SECS);
    setStep('ratelimit');
    if (countdownRef.current) clearInterval(countdownRef.current);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          onDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function analyzeText(text: string) {
    setStep('analyzing');
    try {
      const result = await extractAssignmentsFromOutline(text);
      setSubject(result.subject);
      setExtracted(result.assignments);
      setSelected(new Set(result.assignments.map((_, i) => i)));
      setStep('review');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      const isRateLimit =
        msg.toLowerCase().includes('rate') ||
        msg.includes('429') ||
        msg.toLowerCase().includes('rate-limited');

      if (isRateLimit) {
        pendingTextRef.current = text;
        startCountdown(() => analyzeText(text));
      } else {
        setError(msg);
        setStep('error');
      }
    }
  }

  const isImageFile = (f: File) => f.type.startsWith('image/');

  async function handleFile(file: File) {
    if (!file) return;
    setError(null);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }

    let text: string;
    try {
      setStep('extracting');
      if (file.type === 'application/pdf') {
        text = await extractFromPdf(file);
      } else if (isImageFile(file)) {
        // Vision AI reads the screenshot/photo and returns raw text,
        // which then goes through the same outline extraction pipeline.
        text = await extractFromImage(file);
        if (!text.trim()) throw new Error('Could not read text from image. Try a clearer screenshot or a PDF.');
      } else {
        throw new Error('Please upload a PDF or image (JPG, PNG, WEBP) of your subject outline.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStep('error');
      return;
    }

    await analyzeText(text);
  }

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function handleAddAll() {
    setAdding(true);
    const toAdd = extracted.filter((_, i) => selected.has(i));
    for (const a of toAdd) {
      addAssignment({
        title:          a.title,
        subject,
        details:        a.details,
        dueDate:        a.dueDate,
        difficulty:     a.difficulty as Difficulty,
        estimatedHours: a.estimatedHours,
        weight:         a.weight || undefined,   // persist "25%" weighting
      });
    }
    // Reschedule notifications to include all the newly imported assignments
    const latest = useAssignmentStore.getState().assignments;
    rescheduleAll(latest);
    navigate('/assignments');
  }

  const selectedCount = selected.size;

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="pb-8 min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* Header */}
      <div className="relative bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 overflow-hidden px-5 pt-12 pb-5">
        <div className="absolute -top-8 -right-8 w-36 h-36 bg-violet-400/20 rounded-full blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white shrink-0"
          >
            <ChevronLeftIcon />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-white">Import Subject Outline</h1>
            <p className="text-indigo-200 text-xs mt-0.5">PDF or image — AI extracts all assignments</p>
          </div>
        </div>
      </div>

      {/* ── Upload / Error ───────────────────────────────────────── */}
      {(step === 'upload' || step === 'error') && (
        <div className="px-4 pt-4 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f); }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-white dark:bg-gray-800 border-2 border-dashed border-indigo-200 dark:border-indigo-700 rounded-2xl p-10 flex flex-col items-center gap-3 hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-colors active:scale-[0.98]"
          >
            <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center">
              <DocumentArrowUpIcon className="w-7 h-7 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-800 dark:text-white text-sm">Tap to upload subject outline</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PDF  ·  JPG  ·  PNG  ·  WEBP  — all assignments extracted automatically</p>
            </div>
          </button>

          {/* Format pills */}
          <div className="flex gap-2 justify-center">
            {[
              { icon: '📄', label: 'PDF outline', sub: 'Best quality' },
              { icon: '📸', label: 'Screenshot', sub: 'PNG / JPG' },
              { icon: '📷', label: 'Camera photo', sub: 'HEIC / WEBP' },
            ].map(({ icon, label, sub }) => (
              <button
                key={label}
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-2 py-3 flex flex-col items-center gap-1 active:bg-indigo-50 dark:active:bg-indigo-900/20 transition-colors"
              >
                <span className="text-xl">{icon}</span>
                <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">{label}</span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500">{sub}</span>
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-widest">HOW IT WORKS</p>
            {[
              ['📄', 'Upload your subject outline PDF or take a photo of it'],
              ['🤖', 'AI reads the document and identifies every assessed item'],
              ['✅', 'Review the extracted list and add them all at once'],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-3">
                <span className="text-lg">{icon}</span>
                <span className="text-sm text-gray-600 dark:text-gray-300">{text}</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">Powered by Gemini AI — no setup required.</p>
          </div>

          {step === 'error' && error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-2xl p-4">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Something went wrong</p>
              <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
              <button onClick={() => { setStep('upload'); setError(null); }}
                className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                Try again →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Processing ───────────────────────────────────────────── */}
      {(step === 'extracting' || step === 'analyzing') && (
        <div className="px-5 pt-12 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center">
            <svg className="animate-spin w-8 h-8 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
          <div className="space-y-2 w-full max-w-xs">
            <StepRow label="Reading document"              done={step === 'analyzing'} active={step === 'extracting'} />
            <StepRow label="Analysing assignments with AI" done={false}               active={step === 'analyzing'} />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {step === 'extracting'
              ? 'Extracting text from your document…'
              : 'AI is reading the outline and finding all assignments…'}
          </p>
        </div>
      )}

      {/* ── Rate-limit countdown ─────────────────────────────────── */}
      {step === 'ratelimit' && (
        <div className="px-5 pt-10 flex flex-col items-center text-center gap-5">
          {/* Circular countdown ring */}
          <div className="relative w-28 h-28">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
              <circle cx="56" cy="56" r="48" strokeWidth="7" fill="none"
                className="text-gray-200 dark:text-gray-700" stroke="currentColor" />
              <circle cx="56" cy="56" r="48" strokeWidth="7" fill="none"
                stroke="#f59e0b" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 48}`}
                strokeDashoffset={`${2 * Math.PI * 48 * (countdown / RETRY_SECS)}`}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-gray-800 dark:text-white leading-none">{countdown}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium mt-0.5">sec</span>
            </div>
          </div>

          <div>
            <p className="font-bold text-gray-800 dark:text-white text-base">Rate limit reached</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Retrying automatically in {countdown}s — no action needed
            </p>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4 text-left w-full max-w-xs space-y-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">⚡ Why does this happen?</p>
            <p className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
              Groq's free tier allows 30 requests/minute per key. Your PDF triggered the limit across all keys. It resets in 60 seconds — then it retries automatically.
            </p>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 pt-1">Want to avoid this?</p>
            <p className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
              Add more keys at <span className="font-medium">console.groq.com</span> (free accounts). Each key gets its own 30 req/min quota.
            </p>
          </div>

          <button
            onClick={() => {
              if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
              setStep('upload');
            }}
            className="text-xs text-gray-400 dark:text-gray-500 underline underline-offset-2"
          >
            Cancel and go back
          </button>
        </div>
      )}

      {/* ── Review ───────────────────────────────────────────────── */}
      {step === 'review' && (
        <div className="px-4 pt-4 space-y-4">
          <div className="bg-indigo-600 rounded-2xl px-4 py-3">
            <p className="text-indigo-200 text-xs font-semibold tracking-widest mb-0.5">SUBJECT</p>
            <p className="text-white font-bold text-sm leading-snug">{subject}</p>
            <p className="text-indigo-200 text-xs mt-1">
              {extracted.length} assessment{extracted.length !== 1 ? 's' : ''} found
            </p>
          </div>

          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-widest">SELECT TO IMPORT</p>
            <button
              onClick={() => {
                if (selected.size === extracted.length) setSelected(new Set());
                else setSelected(new Set(extracted.map((_, i) => i)));
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-medium"
            >
              {selected.size === extracted.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="space-y-3">
            {extracted.map((a, i) => (
              <button key={i} onClick={() => toggleSelect(i)}
                className={`w-full text-left bg-white dark:bg-gray-800 rounded-2xl border-2 p-4 transition-all ${
                  selected.has(i)
                    ? 'border-indigo-400 shadow-sm shadow-indigo-100 dark:shadow-indigo-900/30'
                    : 'border-gray-100 dark:border-gray-700 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    selected.has(i) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {selected.has(i) && <CheckIcon className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm leading-snug flex-1">{a.title}</p>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <DifficultyBadge difficulty={a.difficulty as Difficulty} />
                        {a.weight && a.weight !== '0%' && (
                          <span className="text-xs bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full font-semibold">
                            {a.weight}
                          </span>
                        )}
                        {a.weight === '0%' && (
                          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                            Formative
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
                      📅 {formatDueDate(a.dueDate)} &nbsp;•&nbsp; ~{a.estimatedHours}h
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2">{a.details}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="sticky bottom-4 pt-2">
            <Button fullWidth onClick={handleAddAll} disabled={selectedCount === 0 || adding}>
              <SparklesIcon className="w-4 h-4" />
              {adding ? 'Adding…' : selectedCount === 0 ? 'Select at least one'
                : `Add ${selectedCount} Assignment${selectedCount !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors ${
      active ? 'bg-indigo-50 dark:bg-indigo-900/30' : done ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-50 dark:bg-gray-800'
    }`}>
      {done ? (
        <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
          <CheckIcon className="w-3 h-3 text-white" />
        </div>
      ) : active ? (
        <svg className="animate-spin w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      ) : (
        <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded-full shrink-0" />
      )}
      <span className={`text-sm ${active ? 'text-indigo-700 dark:text-indigo-300 font-medium' : done ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
        {label}
      </span>
    </div>
  );
}
