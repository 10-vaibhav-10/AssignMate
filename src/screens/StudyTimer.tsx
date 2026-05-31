import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAssignmentStore } from '../stores/assignmentStore';
import { useStreakStore } from '../stores/streakStore';
import { useSettingsStore } from '../stores/settingsStore';
import { toast } from '../stores/toastStore';
import { ChevronLeftIcon } from '../components/Icons';

const RADIUS = 84;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~527.8
const LONG_BREAK_MINS = 15;

type TimerMode = 'work' | 'break' | 'long-break';

/* ── Web Audio beep ─────────────────────────────────────────────── */
function playBeep() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioCtx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx() as AudioContext;
    [0, 0.32, 0.64].forEach((delay) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.45, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.28);
    });
  } catch { /* AudioContext not available in this environment */ }
}

export default function StudyTimer() {
  const navigate   = useNavigate();
  const { id }     = useParams<{ id: string }>();

  const assignments      = useAssignmentStore((s) => s.assignments);
  const updateAssignment = useAssignmentStore((s) => s.update);
  const settings         = useSettingsStore((s) => s.settings);

  const assignment = assignments.find((a) => a.id === id);

  const [mode, setMode]                       = useState<TimerMode>('work');
  const [seconds, setSeconds]                 = useState(() => settings.timerWork * 60);
  const [isRunning, setIsRunning]             = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [minutesLoggedSession, setMinutesLoggedSession] = useState(0);

  /* ── Refs so interval callback always sees fresh values ─────────── */
  const modeRef       = useRef<TimerMode>('work');
  const assignmentRef = useRef(assignment);
  const soundRef      = useRef(settings.timerSound);
  const workMinsRef   = useRef(settings.timerWork);
  const breakSecsRef  = useRef(settings.timerBreak * 60);
  const sessionsRef   = useRef(0);

  modeRef.current       = mode;
  assignmentRef.current = assignment;
  soundRef.current      = settings.timerSound;
  workMinsRef.current   = settings.timerWork;
  breakSecsRef.current  = settings.timerBreak * 60;
  sessionsRef.current   = sessionsCompleted;

  /* ── Derived display values ─────────────────────────────────────── */
  const totalSeconds =
    mode === 'work'       ? settings.timerWork  * 60 :
    mode === 'break'      ? settings.timerBreak * 60 :
    /* long-break */        LONG_BREAK_MINS * 60;

  const progress   = seconds / totalSeconds;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const mins       = Math.floor(seconds / 60);
  const secs       = seconds % 60;

  /* ── Main interval ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!isRunning) return;

    const timerId = window.setInterval(() => {
      setSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(timerId);
          setTimeout(() => {
            if (soundRef.current) playBeep();

            if (modeRef.current === 'work') {
              /* — Log study time — */
              const a    = assignmentRef.current;
              const mins = workMinsRef.current;
              if (a) {
                updateAssignment(a.id, {
                  studyMinutes: (a.studyMinutes ?? 0) + mins,
                });
              }
              useStreakStore.getState().recordActivity();
              setMinutesLoggedSession((m) => m + mins);

              /* — Advance session counter — */
              const newCount = sessionsRef.current + 1;
              setSessionsCompleted(newCount);

              /* — Every 4th session → long break — */
              if (newCount % 4 === 0) {
                toast.success('4 sessions complete — take a long break! 🎉');
                setMode('long-break');
                setSeconds(LONG_BREAK_MINS * 60);
              } else {
                toast.info('Focus session done! Take a break ☕');
                setMode('break');
                setSeconds(breakSecsRef.current);
              }
              setIsRunning(true);
            } else {
              /* — Break ended, back to work — */
              if (modeRef.current === 'long-break') {
                toast.info('Long break over — ready for a new set! 💪');
              } else {
                toast.info('Break over — stay focused! 💪');
              }
              setMode('work');
              setSeconds(workMinsRef.current * 60);
              setIsRunning(false);
            }
          }, 0);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [isRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggle() { setIsRunning((r) => !r); }

  function handleReset() {
    setIsRunning(false);
    setSeconds(
      mode === 'work'       ? settings.timerWork  * 60 :
      mode === 'break'      ? settings.timerBreak * 60 :
      LONG_BREAK_MINS * 60,
    );
  }

  if (!assignment) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Assignment not found
      </div>
    );
  }

  /* ── Mode-dependent colours ─────────────────────────────────────── */
  const isWork      = mode === 'work';
  const isLongBreak = mode === 'long-break';

  const ringGradId   = isWork ? 'workGrad' : isLongBreak ? 'longGrad' : 'breakGrad';
  const ringTrack    = isWork ? 'rgba(99,102,241,0.12)' : isLongBreak ? 'rgba(217,70,239,0.14)' : 'rgba(16,185,129,0.12)';
  const timeColor    = isWork ? 'text-indigo-700 dark:text-indigo-300' : isLongBreak ? 'text-fuchsia-600 dark:text-fuchsia-300' : 'text-emerald-600 dark:text-emerald-400';
  const labelColor   = isWork ? 'text-indigo-400' : isLongBreak ? 'text-fuchsia-400' : 'text-emerald-500';
  const modeLabel    = isWork ? 'FOCUS TIME' : isLongBreak ? 'LONG BREAK' : 'BREAK TIME';
  const btnGradient  = isWork
    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 shadow-indigo-300/40'
    : isLongBreak
      ? 'bg-gradient-to-r from-fuchsia-600 to-violet-600 shadow-fuchsia-300/40'
      : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-300/40';

  const totalLogged   = (assignment.studyMinutes ?? 0) + minutesLoggedSession;
  const estimatedMins = assignment.estimatedHours * 60;
  const loggedPct     = estimatedMins > 0 ? Math.min((totalLogged / estimatedMins) * 100, 100) : 0;

  /* How many sessions shown in the dot row (grouped in sets of 4) */
  const setIndex       = Math.floor(sessionsCompleted / 4);    // which set of 4 we're on
  const sessInSet      = sessionsCompleted % 4;                // sessions done in current set
  const currentDotIdx  = isWork ? sessInSet : -1;              // highlight active dot

  return (
    <div className="flex flex-col min-h-screen dark:bg-gray-950" style={{ background: '#f4f3ff' }}>

      {/* ── Header ──────────────────────────────────────────── */}
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
            <p className="text-indigo-200 text-[10px] font-bold tracking-widest">STUDY TIMER</p>
            <h1 className="text-white font-extrabold text-base leading-tight truncate">
              {assignment.title}
            </h1>
            <p className="text-indigo-300 text-xs truncate">{assignment.subject}</p>
          </div>
          {/* Settings shortcut */}
          <button
            onClick={() => navigate('/settings')}
            className="ml-auto w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-indigo-200 shrink-0"
            title="Timer settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Timer body ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 py-6">

        {/* Session dots (set label + 4 pips) */}
        <div className="flex flex-col items-center gap-2">
          {setIndex > 0 && (
            <span className="text-[10px] font-black tracking-widest text-violet-400">
              SET {setIndex + 1}
            </span>
          )}
          <div className="flex items-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i < sessInSet
                    ? 'w-3 h-3 bg-emerald-500'
                    : i === currentDotIdx
                      ? 'w-4 h-4 bg-indigo-500 shadow-md shadow-indigo-300/50 scale-110'
                      : 'w-3 h-3 bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-1 font-medium">
              {sessInSet < 4
                ? `Session ${sessInSet + 1} of 4`
                : 'Set complete! 🎉'}
            </span>
          </div>
        </div>

        {/* Circular countdown */}
        <div className="relative flex items-center justify-center">
          <svg viewBox="0 0 200 200" className="w-64 h-64 -rotate-90">
            {/* Track ring */}
            <circle cx="100" cy="100" r={RADIUS} fill="none" stroke={ringTrack} strokeWidth="12" />
            {/* Progress ring */}
            <circle
              cx="100" cy="100" r={RADIUS}
              fill="none"
              stroke={`url(#${ringGradId})`}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.8s linear' }}
            />
            <defs>
              <linearGradient id="workGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
              <linearGradient id="breakGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <linearGradient id="longGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#d946ef" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
            </defs>
          </svg>

          {/* Centre overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-5xl font-extrabold tabular-nums tracking-tight ${timeColor}`}>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
            <span className={`text-[11px] font-bold tracking-[0.18em] mt-1.5 ${labelColor}`}>
              {modeLabel}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <button
            onClick={handleToggle}
            className={`w-full py-4 rounded-2xl font-bold text-white text-base shadow-lg active:scale-95 transition-all ${btnGradient}`}
          >
            {isRunning
              ? '⏸  Pause'
              : seconds === totalSeconds
                ? '▶  Start'
                : '▶  Resume'}
          </button>
          <button
            onClick={handleReset}
            className="w-full py-3 rounded-2xl font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 text-sm active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
          >
            ↺  Reset
          </button>
        </div>

        {/* Stats row */}
        <div className="w-full max-w-xs bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/40 px-5 py-4">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 mb-3">STUDY TIME</p>
          <div className="flex items-center justify-between mb-3">
            <div className="text-center">
              <div className="text-xl font-extrabold text-gray-900 dark:text-white">{minutesLoggedSession}</div>
              <div className="text-[10px] text-gray-400 font-medium">THIS SESSION</div>
            </div>
            <div className="w-px h-8 bg-gray-100 dark:bg-gray-700" />
            <div className="text-center">
              <div className="text-xl font-extrabold text-gray-900 dark:text-white">{Math.round(totalLogged)}</div>
              <div className="text-[10px] text-gray-400 font-medium">TOTAL MIN</div>
            </div>
            <div className="w-px h-8 bg-gray-100 dark:bg-gray-700" />
            <div className="text-center">
              <div className="text-xl font-extrabold text-gray-900 dark:text-white">{estimatedMins}</div>
              <div className="text-[10px] text-gray-400 font-medium">ESTIMATED</div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                loggedPct >= 100
                  ? 'bg-gradient-to-r from-emerald-400 to-green-500'
                  : 'bg-gradient-to-r from-indigo-500 to-violet-500'
              }`}
              style={{ width: `${loggedPct}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-right">
            {loggedPct.toFixed(0)}% of estimated time
          </p>
        </div>

        {/* Tip */}
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-xs leading-relaxed">
          {settings.timerWork} min focus → {settings.timerBreak} min break.
          After 4 sessions you get a {LONG_BREAK_MINS} min long break.
          {settings.timerSound ? ' 🔔 Sound on.' : ''}
        </p>
      </div>
    </div>
  );
}
