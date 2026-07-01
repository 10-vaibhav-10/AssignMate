import { useState, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAssignmentStore } from '../stores/assignmentStore';
import { toast } from '../stores/toastStore';
import { rescheduleAll } from '../services/notifications';
import { Button } from '../components/common/Button';
import { ChevronLeftIcon } from '../components/Icons';
import { DIFFICULTY_OPTIONS, DIFFICULTY_LABELS, ESTIMATED_HOURS_OPTIONS } from '../constants';
import { extractFromPdf, extractFromImage } from '../services/fileExtractor';
import type { Difficulty, Priority } from '../types';

const PRIORITY_OPTIONS: Priority[] = ['urgent', 'normal', 'low'];

const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: '🔥 Urgent',
  normal: '⚡ Normal',
  low:    '🌿 Low',
};

const PRIORITY_ACTIVE_CLS: Record<Priority, string> = {
  urgent: 'bg-red-500 text-white',
  normal: 'bg-indigo-600 text-white',
  low:    'bg-emerald-500 text-white',
};

export default function AssignmentForm() {
  const navigate    = useNavigate();
  const { id }      = useParams();
  const assignments = useAssignmentStore((s) => s.assignments);
  const add         = useAssignmentStore((s) => s.add);
  const update      = useAssignmentStore((s) => s.update);

  const existing = id ? assignments.find((a) => a.id === id) : undefined;
  const isEdit   = Boolean(existing);

  /* Unique subjects from existing assignments — used for autocomplete */
  const existingSubjects = useMemo(
    () => [...new Set(assignments.map((a) => a.subject))].sort(),
    [assignments],
  );

  const [title,          setTitle]          = useState(existing?.title ?? '');
  const [subject,        setSubject]        = useState(existing?.subject ?? '');
  const [details,        setDetails]        = useState(existing?.details ?? '');
  const [dueDate,        setDueDate]        = useState(existing?.dueDate ?? '');
  const [difficulty,     setDifficulty]     = useState<Difficulty>(existing?.difficulty ?? 'medium');
  const [estimatedHours, setEstimatedHours] = useState<number>(existing?.estimatedHours ?? 5);
  const [priority,       setPriority]       = useState<Priority>(existing?.priority ?? 'normal');
  const [grade,          setGrade]          = useState<string>(
    existing?.grade !== undefined ? String(existing.grade) : '',
  );
  const [errors,         setErrors]         = useState<Record<string, string>>({});
  const [extractStatus,  setExtractStatus]  = useState<'idle' | 'loading' | 'error'>('idle');
  const [extractError,   setExtractError]   = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setExtractStatus('loading');
    setExtractError(null);
    try {
      let extracted: string;
      if (file.type === 'application/pdf') {
        extracted = await extractFromPdf(file);
      } else {
        extracted = await extractFromImage(file);
      }
      setDetails((prev) => (prev.trim() ? `${prev.trim()}\n\n${extracted}` : extracted));
      setExtractStatus('idle');
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Extraction failed. Try again.');
      setExtractStatus('error');
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!title.trim())   e.title   = 'Title is required';
    if (!subject.trim()) e.subject = 'Subject is required';
    if (!dueDate)        e.dueDate = 'Due date is required';

    const gradeNum = grade.trim() ? Number(grade) : NaN;
    if (grade.trim() && (isNaN(gradeNum) || gradeNum < 0 || gradeNum > 100)) {
      e.grade = 'Grade must be 0–100';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;

    const gradeVal = grade.trim() ? Number(grade) : undefined;

    if (isEdit && existing) {
      update(existing.id, {
        title:          title.trim(),
        subject:        subject.trim(),
        details:        details.trim(),
        dueDate,
        difficulty,
        estimatedHours,
        priority,
        grade:          gradeVal,
      });
      toast.success('Assignment updated!');
    } else {
      add({
        title:   title.trim(),
        subject: subject.trim(),
        details: details.trim(),
        dueDate,
        difficulty,
        estimatedHours,
        priority,
        grade: gradeVal,
      });
      toast.success('Assignment created!');
    }
    // Reschedule notifications so the new/changed due date is reflected immediately
    const latest = useAssignmentStore.getState().assignments;
    rescheduleAll(latest);
    navigate(-1);
  }

  return (
    <div className="pb-8">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 overflow-hidden px-5 pt-12 pb-5">
        <div className="absolute -top-8 -right-8 w-36 h-36 bg-violet-400/20 rounded-full blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white shrink-0"
          >
            <ChevronLeftIcon />
          </button>
          <h1 className="text-xl font-extrabold text-white">
            {isEdit ? 'Edit Assignment' : 'New Assignment'}
          </h1>
        </div>
      </div>

      <div className="px-4 space-y-4 mt-4">

        {/* Title */}
        <FormField label="Assignment Title *" error={errors.title}>
          <input
            className={inputClass(!!errors.title)}
            placeholder="e.g. Database Normalization Essay"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormField>

        {/* Subject — with autocomplete from existing subjects */}
        <FormField label="Subject / Course *" error={errors.subject}>
          <input
            list="subject-suggestions"
            className={inputClass(!!errors.subject)}
            placeholder="e.g. Computer Science 301"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          {existingSubjects.length > 0 && (
            <datalist id="subject-suggestions">
              {existingSubjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </FormField>

        {/* Details */}
        <FormField label="Assignment Details">
          <textarea
            className={`${inputClass(false)} resize-none`}
            placeholder="Paste your assignment brief, instructions, or any relevant details here..."
            rows={5}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={extractStatus === 'loading'}
            className="mt-2 flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {extractStatus === 'loading' ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Extracting text…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload PDF or image to auto-fill
              </>
            )}
          </button>
          {extractStatus === 'error' && extractError && (
            <p className="text-red-500 dark:text-red-400 text-xs mt-1">{extractError}</p>
          )}
        </FormField>

        {/* Due Date */}
        <FormField label="Due Date *" error={errors.dueDate}>
          <input
            type="date"
            className={inputClass(!!errors.dueDate)}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </FormField>

        {/* Priority */}
        <FormField label="Priority">
          <div className="flex rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                  priority === p
                    ? PRIORITY_ACTIVE_CLS[p]
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </FormField>

        {/* Difficulty */}
        <FormField label="Difficulty">
          <div className="flex rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  difficulty === d
                    ? d === 'easy'
                      ? 'bg-emerald-500 text-white'
                      : d === 'medium'
                        ? 'bg-amber-500 text-white'
                        : 'bg-red-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
        </FormField>

        {/* Estimated Hours */}
        <FormField label="Estimated Time">
          <div className="flex gap-2">
            {ESTIMATED_HOURS_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => setEstimatedHours(h)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  estimatedHours === h
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-500'
                }`}
              >
                {h === 20 ? '20h+' : `${h}h`}
              </button>
            ))}
          </div>
        </FormField>

        {/* Grade (optional) */}
        <FormField label="Grade Received (optional)" error={errors.grade}>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              className={`${inputClass(!!errors.grade)} pr-10`}
              placeholder="e.g. 85"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm font-medium pointer-events-none">
              %
            </span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            Fill in once you receive your grade.
          </p>
        </FormField>

        <Button fullWidth onClick={handleSave} className="mt-4">
          {isEdit ? 'Save Changes' : 'Create Assignment'}
        </Button>
      </div>
    </div>
  );
}

/* ── Helper components ───────────────────────────────────────────── */

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `w-full px-4 py-3 rounded-xl border text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 focus:bg-white dark:focus:bg-gray-600 ${
    hasError
      ? 'border-red-400 bg-red-50 dark:bg-red-950/30 dark:border-red-500'
      : 'border-gray-200 dark:border-gray-600'
  }`;
}
