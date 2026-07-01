import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAssignmentStore } from '../stores/assignmentStore';
import { useTaskStore } from '../stores/taskStore';
import { useStreakStore } from '../stores/streakStore';
import { isOverdue, getGreeting, formatDueDate, formatRelativeDue, getDaysUntilDue } from '../utils';
import { DifficultyBadge } from '../components/common/Badge';
import { ProgressBar } from '../components/common/ProgressBar';
import { PlusIcon, FlameIcon, DocumentArrowUpIcon } from '../components/Icons';
import { toast } from '../stores/toastStore';
import type { Difficulty } from '../types';

/* ── Daily quotes (date-seeded so they change each day) ────────── */
const QUOTES: { text: string; author: string }[] = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Don't watch the clock; do what it does keep going.", author: "Sam Levenson" },
  { text: "Learning is not attained by chance; it must be sought with ardour.", author: "Abigail Adams" },
  { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
  { text: "The more that you read, the more things you will know.", author: "Dr. Seuss" },
  { text: "Education is the most powerful weapon you can use to change the world.", author: "Nelson Mandela" },
  { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
  { text: "Study hard what interests you the most in the most undisciplined way.", author: "Richard Feynman" },
  { text: "There are no shortcuts to any place worth going.", author: "Beverly Sills" },
  { text: "Perseverance is not a long race; it is many short races one after another.", author: "Walter Elliott" },
  { text: "The difference between ordinary and extraordinary is that little extra.", author: "Jimmy Johnson" },
  { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "The capacity to learn is a gift; the ability to learn is a skill.", author: "Brian Herbert" },
  { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
  { text: "Great things never come from comfort zones.", author: "Unknown" },
  { text: "Dream it. Wish it. Do it.", author: "Unknown" },
];

function getDailyQuote() {
  const start = new Date(new Date().getFullYear(), 0, 0).getTime();
  const dayOfYear = Math.floor((Date.now() - start) / 86_400_000);
  return QUOTES[dayOfYear % QUOTES.length];
}

/* ── Subject → gradient mapping (hash-stable) ─────────────────── */
const GRADIENTS = [
  'from-violet-600 to-purple-700',
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-700',
  'from-rose-500 to-pink-700',
  'from-amber-500 to-orange-600',
  'from-fuchsia-500 to-violet-700',
];

function subjectGradient(subject: string): string {
  let h = 0;
  for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) & 0xffff;
  return GRADIENTS[h % GRADIENTS.length];
}

export default function Home() {
  const navigate         = useNavigate();
  const assignments      = useAssignmentStore((s) => s.assignments);
  const updateAssignment = useAssignmentStore((s) => s.update);
  const tasks            = useTaskStore((s) => s.tasks);
  const toggleTask       = useTaskStore((s) => s.toggle);
  const streakData       = useStreakStore((s) => s.data);

  /* Toggle a task directly from the Home screen and recalculate progress */
  function handleToggleTask(taskId: string, assignmentId: string) {
    toggleTask(taskId);
    const assignTasks = useTaskStore.getState().tasks.filter((t) => t.assignmentId === assignmentId);
    const completed   = assignTasks.filter((t) => t.completed).length;
    const progress    = assignTasks.length > 0 ? Math.round((completed / assignTasks.length) * 100) : 0;
    updateAssignment(assignmentId, { progress });
    if (progress === 100) toast.success('Assignment complete! 🎉');
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const dateLabel = format(new Date(), 'EEEE, d MMMM');

  const activeAssignments = assignments.filter((a) => a.progress < 100);
  const overdueAssignments = assignments.filter(isOverdue);
  const dueToday = assignments.filter((a) => getDaysUntilDue(a.dueDate) === 0 && a.progress < 100);

  const dueSoon = assignments.filter((a) => {
    const d = getDaysUntilDue(a.dueDate);
    return d >= 1 && d <= 3 && a.progress < 100;   // excludes today (shown separately)
  });

  const todayTasks = tasks.filter((t) => {
    const a = assignments.find((x) => x.id === t.assignmentId);
    return t.dueDate === todayStr && a && a.progress < 100;
  });
  const completedTodayCount = todayTasks.filter((t) => t.completed).length;

  const weeklyAssignments = assignments.filter((a) => {
    const d = getDaysUntilDue(a.dueDate);
    return d >= 0 && d <= 7 && a.progress < 100;
  });
  const weeklyTotalHours = weeklyAssignments.reduce((s, a) => s + a.estimatedHours, 0);
  const weeklyDoneHours = weeklyAssignments.reduce(
    (s, a) => s + (a.estimatedHours * a.progress) / 100,
    0,
  );
  const weeklyPct = weeklyTotalHours > 0 ? (weeklyDoneHours / weeklyTotalHours) * 100 : 0;

  function getMotivation() {
    if (streakData.currentStreak >= 7) return `🔥 ${streakData.currentStreak}-day streak! Unstoppable!`;
    if (overdueAssignments.length > 0) return "You have overdue work. Let's catch up!";
    if (dueSoon.length > 0) return 'Deadlines approaching !!! Stay focused!';
    if (activeAssignments.length > 0) return "Let's get some work done today.";
    return 'All clear. Enjoy the break! 🎉';
  }

  // Assignments due in 1–7 days (today shown separately; overdue shown separately)
  const upcoming = assignments.filter((a) => {
    if (a.progress === 100) return false;
    const d = getDaysUntilDue(a.dueDate);
    return d >= 1 && d <= 7;
  });

  /* ── Deadline cluster detection ─────────────────────────────── */
  const clusterWarning = (() => {
    const pending = assignments.filter((a) => !isOverdue(a) && a.progress < 100);
    if (pending.length < 3) return null;
    const sorted = [...pending].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    for (let i = 0; i < sorted.length; i++) {
      const start = new Date(sorted[i].dueDate + 'T00:00:00').getTime();
      const end   = start + 7 * 24 * 60 * 60 * 1000;
      const inWindow = sorted.filter((a) => {
        const t = new Date(a.dueDate + 'T00:00:00').getTime();
        return t >= start && t <= end;
      });
      if (inWindow.length >= 3) {
        return { count: inWindow.length };
      }
    }
    return null;
  })();

  const pendingTasks = tasks
    .filter((t) => {
      if (t.completed) return false;
      const a = assignments.find((x) => x.id === t.assignmentId);
      return a && a.progress < 100;
    })
    .slice(0, 5);

  return (
    <div className="pb-4">
      {/* ── Hero Header ──────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden px-5 pt-12 pb-8"
        style={{
          background:
            'linear-gradient(145deg, #4f46e5 0%, #7c3aed 30%, #a855f7 60%, #d946ef 85%, #ec4899 100%)',
        }}
      >
        {/* Decorative blobs */}
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none animate-float" />
        <div className="absolute top-8 left-1/3 w-40 h-40 bg-fuchsia-400/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-52 h-52 bg-violet-300/15 rounded-full blur-2xl pointer-events-none" />

        {/* Date pill */}
        <div className="relative inline-flex items-center bg-white/15 border border-white/20 rounded-full px-3.5 py-1 mb-3 backdrop-blur-sm">
          <span className="text-white/90 text-[11px] font-bold tracking-[0.08em]">{dateLabel}</span>
        </div>

        {/* Greeting */}
        <h1 className="relative text-white text-[30px] font-black leading-tight mb-1 drop-shadow-sm">
          {getGreeting()} 👋
        </h1>
        <p className="relative text-white/75 text-sm font-semibold mb-6">{getMotivation()}</p>

        {/* Stat chips */}
        <div className="relative flex gap-2.5">
          <GlassChip label="ACTIVE" value={String(activeAssignments.length)} />
          <GlassChip
            label="TODAY"
            value={todayTasks.length > 0 ? `${completedTodayCount}/${todayTasks.length}` : 'Free'}
            accent={todayTasks.length > 0 && completedTodayCount < todayTasks.length}
          />
          <GlassChip
            label="DUE SOON"
            value={String(dueSoon.length)}
            danger={dueSoon.length > 0}
          />
          {streakData.currentStreak > 0 && (
            <GlassChip
              label="STREAK"
              value={`${streakData.currentStreak}d`}
              streak
            />
          )}
        </div>
      </div>

      {/* ── Floating weekly card ─────────────────────────────────── */}
      {weeklyTotalHours > 0 && (
        <div className="mx-4 -mt-4 relative z-10">
          <div className="bg-white dark:bg-[#111128] rounded-3xl shadow-xl shadow-violet-900/12 dark:shadow-black/50 border border-violet-100/60 dark:border-violet-900/20 px-5 py-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="text-[10px] font-black tracking-widest text-gray-400 dark:text-gray-500 mb-0.5">
                  WEEKLY WORKLOAD
                </p>
                <p className="text-gray-900 dark:text-white font-black text-sm">
                  {weeklyAssignments.length} assignment{weeklyAssignments.length !== 1 ? 's' : ''} this week
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`text-xl font-black ${
                    weeklyPct > 80 ? 'text-rose-500' : 'text-violet-600 dark:text-violet-400'
                  }`}
                >
                  {Math.round(weeklyPct)}%
                </span>
                <p className="text-[10px] text-gray-400 font-semibold">
                  {weeklyDoneHours.toFixed(1)}h / {weeklyTotalHours}h
                </p>
              </div>
            </div>
            <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  weeklyPct > 80
                    ? 'bg-gradient-to-r from-rose-500 to-red-400'
                    : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                }`}
                style={{ width: `${Math.min(weeklyPct, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Streak banner ─────────────────────────────────────────── */}
      {streakData.currentStreak >= 2 && (
        <div className="mx-4 mt-3 rounded-3xl overflow-hidden shadow-lg shadow-orange-400/20 dark:shadow-orange-900/25">
          <div
            className="px-4 py-3.5 flex items-center gap-3"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 60%, #ec4899 100%)' }}
          >
            <div className="w-9 h-9 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <FlameIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-white font-black text-sm">
                {streakData.currentStreak}-day streak 🔥
              </p>
              <p className="text-white/70 text-xs font-semibold">
                Best: {streakData.longestStreak}d · Keep completing tasks!
              </p>
            </div>
            <button
              onClick={() => navigate('/stats')}
              className="bg-white/20 hover:bg-white/30 text-white text-xs font-black px-3 py-1.5 rounded-xl border border-white/25 transition-colors"
            >
              Stats →
            </button>
          </div>
        </div>
      )}

      {/* ── Deadline cluster warning ────────────────────────────────── */}
      {clusterWarning && (
        <div className="mx-4 mt-3 rounded-3xl overflow-hidden shadow-lg shadow-amber-400/20 dark:shadow-amber-900/25">
          <div
            className="px-4 py-3.5 flex items-center gap-3"
            style={{ background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 60%, #fbbf24 100%)' }}
          >
            <div className="w-9 h-9 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <span className="text-lg">⚡</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-black text-sm">Deadline cluster detected!</p>
              <p className="text-white/75 text-xs font-semibold mt-0.5">
                {clusterWarning.count} assignments due within the same week. Plan ahead!
              </p>
            </div>
            <button
              onClick={() => navigate('/calendar')}
              className="bg-white/20 hover:bg-white/30 text-white text-xs font-black px-3 py-1.5 rounded-xl border border-white/25 transition-colors shrink-0"
            >
              View →
            </button>
          </div>
        </div>
      )}

      <div className="px-4 space-y-5 mt-4">
        {/* ── Daily quote (always visible) ──────────────────────────── */}
        <DailyQuoteCard />

        {/* ── 7-day activity strip ──────────────────────────────────── */}
        <ActivityStrip activityLog={streakData.activityLog} />

        {/* ── Overdue ──────────────────────────────────────────────── */}
        {overdueAssignments.length > 0 && (
          <section>
            <SectionHeader icon="⚡" label="OVERDUE" danger />
            <div className="space-y-2.5">
              {overdueAssignments.map((a) => (
                <AssignmentCard
                  key={a.id}
                  assignment={a}
                  onClick={() => navigate(`/assignments/${a.id}`)}
                  overdue
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Due Today ────────────────────────────────────────────── */}
        {dueToday.length > 0 && (
          <section>
            <SectionHeader icon="🗓️" label="DUE TODAY" today />
            <div className="space-y-2.5">
              {dueToday.map((a) => (
                <AssignmentCard
                  key={a.id}
                  assignment={a}
                  onClick={() => navigate(`/assignments/${a.id}`)}
                  today
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Due This Week ────────────────────────────────────────── */}
        {upcoming.length > 0 && (
          <section>
            <SectionHeader icon="📅" label="DUE THIS WEEK" />
            <div className="space-y-2.5">
              {upcoming.map((a) => (
                <AssignmentCard
                  key={a.id}
                  assignment={a}
                  onClick={() => navigate(`/assignments/${a.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Pending Tasks ─────────────────────────────────────────── */}
        {pendingTasks.length > 0 && (
          <section>
            <SectionHeader icon="✓" label="PENDING TASKS" />
            <div className="bg-white dark:bg-[#111128] rounded-3xl shadow-sm shadow-violet-100/40 dark:shadow-black/30 border border-violet-50 dark:border-violet-900/20 overflow-hidden">
              {pendingTasks.map((task, i) => {
                const assignment = assignments.find((a) => a.id === task.assignmentId);
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${
                      i !== 0 ? 'border-t border-gray-50 dark:border-white/5' : ''
                    }`}
                  >
                    {/* Tap checkbox to complete without leaving Home */}
                    <button
                      onClick={() => handleToggleTask(task.id, task.assignmentId)}
                      className="w-5 h-5 rounded-full border-2 border-violet-300 dark:border-violet-700 flex items-center justify-center shrink-0 hover:border-violet-500 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"
                      aria-label="Complete task"
                    />
                    {/* Tap title to open assignment detail */}
                    <span
                      className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate font-semibold cursor-pointer hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                      onClick={() => navigate(`/assignments/${task.assignmentId}`)}
                    >
                      {task.title}
                    </span>
                    {assignment && (
                      <span className="text-[10px] text-violet-500 dark:text-violet-400 font-bold truncate max-w-[90px] bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 rounded-full shrink-0">
                        {assignment.subject.split(' ')[0]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Empty state ───────────────────────────────────────────── */}
        {assignments.length === 0 && (
          <div className="flex flex-col gap-4">
            {/* Icon + CTA */}
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4 shadow-xl shadow-violet-400/25"
                style={{ background: 'linear-gradient(145deg, #7c3aed, #a855f7, #d946ef)' }}
              >
                <span className="text-3xl">🎯</span>
              </div>
              <h3 className="text-gray-900 dark:text-white font-black text-xl mb-2">
                Study smarter, not harder
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-xs leading-relaxed">
                Add an assignment and let AI build a personalised study plan for you.
              </p>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => navigate('/assignments/import')}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white shadow-lg shadow-violet-400/30 transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7, #d946ef)' }}
                >
                  <DocumentArrowUpIcon className="w-4 h-4" />
                  Import Subject Outline
                </button>
                <button
                  onClick={() => navigate('/assignments/new')}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-950/60 transition-all active:scale-95"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add Manually
                </button>
              </div>
            </div>

            {/* Streak nudge (only when streak banner isn't already showing) */}
            {streakData.currentStreak < 2 && (
              <StreakNudgeCard streak={streakData.currentStreak} />
            )}
          </div>
        )}

      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function GlassChip({
  label,
  value,
  accent = false,
  danger = false,
  streak = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
  streak?: boolean;
}) {
  const bg = streak
    ? 'bg-orange-400/70 border-orange-300/30'
    : danger
      ? 'bg-red-500/70 border-red-400/25'
      : accent
        ? 'bg-white/25 border-white/25'
        : 'bg-white/15 border-white/15';

  return (
    <div
      className={`flex-1 rounded-2xl px-2.5 py-2.5 text-center border backdrop-blur-sm ${bg}`}
    >
      <div className="text-white text-[18px] font-black leading-none mb-0.5">{value}</div>
      <div className="text-white/65 text-[8px] font-black tracking-widest">{label}</div>
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  danger = false,
  today = false,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  today?: boolean;
}) {
  const iconBg = danger ? 'bg-red-100 dark:bg-red-900/30'
    : today ? 'bg-amber-100 dark:bg-amber-900/30'
    : 'bg-violet-100 dark:bg-violet-900/30';
  const textCls = danger ? 'text-red-600 dark:text-red-400'
    : today ? 'text-amber-600 dark:text-amber-400'
    : 'text-gray-700 dark:text-gray-300';
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[13px] ${iconBg}`}>
        {icon}
      </div>
      <h2 className={`font-black text-xs tracking-widest ${textCls}`}>{label}</h2>
    </div>
  );
}

function ActivityStrip({ activityLog }: { activityLog: Record<string, number> }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = format(d, 'yyyy-MM-dd'); // local calendar date — must match streakStore's local-date keys
    const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
    const isToday = i === 6;
    const count = activityLog[dateStr] ?? 0;
    return { dateStr, label, isToday, active: count > 0, count };
  });

  return (
    <div className="bg-white dark:bg-[#111128] rounded-3xl border border-violet-100/60 dark:border-violet-900/20 px-5 py-4 shadow-sm shadow-violet-100/40 dark:shadow-black/30">
      <p className="text-[9px] font-black tracking-widest text-violet-400 dark:text-violet-500 mb-3 uppercase">
        Last 7 Days - No of Tasks You Completed Each Day
      </p>
      <div className="flex gap-1.5">
        {days.map(({ dateStr, label, isToday, active, count }) => (
          <div key={dateStr} className="flex flex-col items-center gap-1.5 flex-1">
            <div
              className={`w-full h-9 rounded-xl flex items-center justify-center transition-all ${
                isToday && active
                  ? 'bg-gradient-to-b from-violet-500 to-fuchsia-500 shadow-md shadow-violet-400/30'
                  : active
                    ? 'bg-violet-100 dark:bg-violet-900/60'
                    : isToday
                      ? 'border-2 border-dashed border-violet-300 dark:border-violet-700'
                      : 'bg-gray-100 dark:bg-gray-800/50'
              }`}
            >
              {active && (
                <span className={`text-[11px] font-black ${isToday ? 'text-white' : 'text-violet-500 dark:text-violet-300'}`}>
                  {count}
                </span>
              )}
            </div>
            <span className={`text-[9px] font-black ${isToday ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-gray-600'}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyQuoteCard() {
  const { text, author } = getDailyQuote();
  return (
    <div className="rounded-3xl overflow-hidden bg-white dark:bg-[#111128] border border-violet-100/60 dark:border-violet-900/20 shadow-sm shadow-violet-100/40 dark:shadow-black/30">
      <div className="px-5 py-5">
        <p className="text-[9px] font-black tracking-widest text-violet-400 dark:text-violet-500 mb-3 uppercase">
          Quote of the Day
        </p>
        <p
          className="text-5xl font-black leading-none mb-2 select-none"
          style={{ color: '#7c3aed', opacity: 0.25 }}
          aria-hidden>
        </p>
        <p className="text-gray-800 dark:text-gray-100 font-semibold text-[14px] leading-relaxed -mt-3">
          {text}
        </p>
        <p className="text-gray-400 dark:text-gray-500 text-xs font-bold mt-3"> - {author}</p>
      </div>
    </div>
  );
}

function StreakNudgeCard({ streak }: { streak: number }) {
  const isDay0 = streak === 0;
  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{
        background: isDay0
          ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)'
          : 'linear-gradient(135deg, #7c2d12 0%, #9a3412 60%, #c2410c 100%)',
      }}
    >
      <div className="px-4 py-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-white/15 rounded-2xl flex items-center justify-center shrink-0">
          <span className="text-xl">{isDay0 ? '✨' : '🔥'}</span>
        </div>
        <div className="flex-1">
          <p className="text-white font-black text-sm">
            {isDay0 ? 'Start your streak today!' : 'Day 1 - keep the flame alive!'}
          </p>
          <p className="text-white/60 text-xs font-semibold mt-0.5">
            {isDay0
              ? 'Complete a task to kick off your first streak.'
              : 'Complete a task tomorrow to hit day 2.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function AssignmentCard({
  assignment,
  onClick,
  overdue = false,
  today = false,
}: {
  assignment: {
    id: string;
    title: string;
    subject: string;
    dueDate: string;
    difficulty: Difficulty;
    progress: number;
  };
  onClick(): void;
  overdue?: boolean;
  today?: boolean;
}) {
  const grad = overdue
    ? 'from-rose-500 to-red-600'
    : today
      ? 'from-amber-500 to-orange-500'
      : assignment.progress === 100
        ? 'from-emerald-500 to-teal-600'
        : subjectGradient(assignment.subject);

  const shadowColor = overdue
    ? 'rgba(244,63,94,0.18)'
    : today
      ? 'rgba(245,158,11,0.18)'
      : 'rgba(124,58,237,0.12)';

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-[#111128] rounded-3xl overflow-hidden cursor-pointer active:scale-[0.98] transition-all border border-violet-50 dark:border-violet-900/20"
      style={{ boxShadow: `0 6px 24px -6px ${shadowColor}, 0 2px 8px -2px ${shadowColor}` }}
    >
      <div className="flex">
        {/* Gradient left bar */}
        <div className={`w-1.5 bg-gradient-to-b ${grad} shrink-0`} />
        <div className="flex-1 px-4 pt-3.5 pb-3.5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              {/* Subject chip */}
              <span
                className={`inline-block text-[9px] font-black tracking-wider mb-1.5 px-2 py-0.5 rounded-full ${
                  overdue
                    ? 'bg-red-50 dark:bg-red-900/25 text-red-600 dark:text-red-400'
                    : today
                      ? 'bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-400'
                      : 'bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-400'
                }`}
              >
                {assignment.subject}
              </span>
              <p className="font-black text-gray-900 dark:text-white text-sm leading-snug">
                {assignment.title}
              </p>
            </div>
            <DifficultyBadge difficulty={assignment.difficulty} />
          </div>
          <p
            className={`text-xs mb-2.5 font-semibold ${
              overdue ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {overdue
              ? `📅 Due ${formatDueDate(assignment.dueDate)}`
              : formatRelativeDue(assignment.dueDate)}
          </p>
          <div className="flex items-center gap-2">
            <ProgressBar progress={assignment.progress} className="flex-1" />
            <span className="text-xs font-black text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {assignment.progress}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
