import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../stores/assignmentStore';
import { extractFromPdf } from '../services/fileExtractor';
import { extractAssignmentsFromOutline } from '../services/ai';
import { formatDueDate } from '../utils';
import { DifficultyBadge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { ChevronLeftIcon, DocumentArrowUpIcon, SparklesIcon, CheckIcon } from '../components/Icons';
import type { ExtractedAssignment, Difficulty } from '../types';

type Step = 'upload' | 'extracting' | 'analyzing' | 'review' | 'error';

export default function ImportOutline() {
  const navigate = useNavigate();
  const addAssignment = useAssignmentStore((s) => s.add);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [extracted, setExtracted] = useState<ExtractedAssignment[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);

  async function handleFile(file: File) {
    if (!file) return;
    setError(null);

    try {
      setStep('extracting');
      let text: string;
      if (file.type === 'application/pdf') {
        text = await extractFromPdf(file);
      } else {
        throw new Error('Please upload a PDF file for subject outline import.');
      }

      setStep('analyzing');
      const result = await extractAssignmentsFromOutline(text);

      setSubject(result.subject);
      setExtracted(result.assignments);
      setSelected(new Set(result.assignments.map((_, i) => i)));
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStep('error');
    }
  }

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleAddAll() {
    setAdding(true);
    const toAdd = extracted.filter((_, i) => selected.has(i));
    for (const a of toAdd) {
      addAssignment({
        title: a.title,
        subject,
        details: a.details,
        dueDate: a.dueDate,
        difficulty: a.difficulty as Difficulty,
        estimatedHours: a.estimatedHours,
      });
    }
    navigate('/assignments');
  }

  const selectedCount = selected.size;

  return (
    <div className="pb-8 min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── Header ────────────────────────────────────────────── */}
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
            <p className="text-indigo-200 text-xs mt-0.5">Upload PDF — AI extracts all assignments</p>
          </div>
        </div>
      </div>

      {/* ── Upload step ───────────────────────────────────────── */}
      {(step === 'upload' || step === 'error') && (
        <div className="px-4 pt-4 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) handleFile(file);
            }}
          />

          {/* Drop zone */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-white dark:bg-gray-800 border-2 border-dashed border-indigo-200 dark:border-indigo-700 rounded-2xl p-10 flex flex-col items-center gap-3 hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-colors active:scale-[0.98]"
          >
            <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center">
              <DocumentArrowUpIcon className="w-7 h-7 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-800 dark:text-white text-sm">Tap to upload subject outline</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PDF files only • All assignments extracted automatically</p>
            </div>
          </button>

          {/* How it works */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-widest">HOW IT WORKS</p>
            {[
              ['📄', 'Upload your subject outline PDF'],
              ['🤖', 'AI reads the document and identifies every assignment'],
              ['✅', 'Review the extracted list and add them all at once'],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-3">
                <span className="text-lg">{icon}</span>
                <span className="text-sm text-gray-600 dark:text-gray-300">{text}</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
              Powered by Groq AI — no setup required.
            </p>
          </div>

          {step === 'error' && error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-2xl p-4">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Something went wrong</p>
              <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
              <button
                onClick={() => { setStep('upload'); setError(null); }}
                className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
              >
                Try again →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Processing steps ──────────────────────────────────── */}
      {(step === 'extracting' || step === 'analyzing') && (
        <div className="px-5 pt-12 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center">
            <svg className="animate-spin w-8 h-8 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>

          <div className="space-y-2 w-full max-w-xs">
            <StepRow label="Reading PDF" done={step === 'analyzing'} active={step === 'extracting'} />
            <StepRow label="Analysing assignments with AI" done={false} active={step === 'analyzing'} />
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {step === 'extracting'
              ? 'Extracting text from your PDF…'
              : 'AI is reading the outline and finding all assignments…'}
          </p>
        </div>
      )}

      {/* ── Review step ───────────────────────────────────────── */}
      {step === 'review' && (
        <div className="px-4 pt-4 space-y-4">
          {/* Subject header */}
          <div className="bg-indigo-600 rounded-2xl px-4 py-3">
            <p className="text-indigo-200 text-xs font-semibold tracking-widest mb-0.5">SUBJECT</p>
            <p className="text-white font-bold text-sm leading-snug">{subject}</p>
            <p className="text-indigo-200 text-xs mt-1">
              {extracted.length} assessment{extracted.length !== 1 ? 's' : ''} found
            </p>
          </div>

          {/* Toggle all */}
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

          {/* Assignment cards */}
          <div className="space-y-3">
            {extracted.map((a, i) => (
              <button
                key={i}
                onClick={() => toggleSelect(i)}
                className={`w-full text-left bg-white dark:bg-gray-800 rounded-2xl border-2 p-4 transition-all ${
                  selected.has(i)
                    ? 'border-indigo-400 shadow-sm shadow-indigo-100 dark:shadow-indigo-900/30'
                    : 'border-gray-100 dark:border-gray-700 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selected.has(i) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
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
              {adding
                ? 'Adding…'
                : selectedCount === 0
                  ? 'Select at least one'
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
