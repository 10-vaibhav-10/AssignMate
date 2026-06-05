import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../stores/assignmentStore';
import { useTaskStore } from '../stores/taskStore';
import { useStreakStore } from '../stores/streakStore';
import { isOverdue, getDaysUntilDue } from '../utils';
import { FlameIcon, ClockIcon, ChartBarIcon } from '../components/Icons';
import type { Assignment } from '../types';

/* ─────────────────────────────────────────────────────────────────────────
 * Pressure Meter — pure calculation helpers
 *
 * "Pressure score" (0–100) = sum of urgency × remaining work × difficulty
 * for all active assignments within the next 14 days (or already overdue).
 * ───────────────────────────────────────────────────────────────────────── */

function urgencyWeight(daysUntilDue: number): number {
  if (daysUntilDue < 0)        return 25;   // overdue — maximum
  if (daysUntilDue === 0)      return 20;   // due today
  if (daysUntilDue <= 2)       return 14;
  if (daysUntilDue <= 5)       return 8;
  if (daysUntilDue <= 10)      return 4;
  if (daysUntilDue <= 14)      return 2;
  return 0;                                  // > 14 days away — no pressure yet
}

function calcPressureScore(assignments: Assignment[]): number {
  let score = 0;
  for (const a of assignments) {
    if (a.progress >= 100) continue;
    const days = getDaysUntilDue(a.dueDate);
    const rem  = (100 - a.progress) / 100;
    const diff = a.difficulty === 'hard' ? 1.5 : a.difficulty === 'medium' ? 1.0 : 0.6;
    score += urgencyWeight(days) * rem * diff;
  }
  return Math.min(100, Math.round(score));
}

/** Calculate pressure score for each of the next N days (forecast sparkline). */
function getPressureForecast(assignments: Assignment[], days = 14): number[] {
  return Array.from({ length: days }, (_, offset) => {
    let score = 0;
    for (const a of assignments) {
      if (a.progress >= 100) continue;
      const futureDays = getDaysUntilDue(a.dueDate) - offset;
      const rem  = (100 - a.progress) / 100;
      const diff = a.difficulty === 'hard' ? 1.5 : a.difficulty === 'medium' ? 1.0 : 0.6;
      score += urgencyWeight(futureDays) * rem * diff;
    }
    return Math.min(100, Math.round(score));
  });
}

type PressureLevel = { label: string; emoji: string; textCls: string; gradient: string };

function getPressureLevel(score: number): PressureLevel {
  if (score >= 80) return { label: 'Critical',     emoji: '💥', textCls: 'text-red-600 dark:text-red-400',     gradient: 'from-red-500 to-rose-600'     };
  if (score >= 60) return { label: 'High Load',    emoji: '🔥', textCls: 'text-orange-600 dark:text-orange-400', gradient: 'from-orange-500 to-red-500' };
  if (score >= 40) return { label: 'Getting Busy', emoji: '⚡', textCls: 'text-amber-600 dark:text-amber-400',   gradient: 'from-amber-400 to-orange-500' };
  if (score >= 20) return { label: 'Manageable',   emoji: '📚', textCls: 'text-teal-600 dark:text-teal-400',    gradient: 'from-teal-400 to-cyan-500'   };
  return           { label: 'All Clear',    emoji: '😌', textCls: 'text-emerald-600 dark:text-emerald-400', gradient: 'from-emerald-400 to-teal-500' };
}

export default function Stats() {
  const navigate = useNavigate();
  const assignments = useAssignmentStore((s) => s.assignments);
  const tasks = useTaskStore((s) => s.tasks);
  const streakData = useStreakStore((s) => s.data);

  /* ── Aggregates ────────────────────────────────────────────── */
  const totalAssignments = assignments.length;
  const completedAssignments = assignments.filter((a) => a.progress === 100).length;
  const overdueAssignments = assignments.filter(isOverdue).length;
  const activeAssignments = totalAssignments - completedAssignments - overdueAssignments;

  const totalStudyMinutes = assignments.reduce((s, a) => s + (a.studyMinutes ?? 0), 0);
  const totalEstimatedMinutes = assignments.reduce((s, a) => s + a.estimatedHours * 60, 0);

  const completedTasks = tasks.filter((t) => t.completed).length;
  const totalTasks = tasks.length;

  /* ── Subject groups ─────────────────────────────────────────── */
  const subjectGroups = useMemo(() => {
    const map: Record<
      string,
      { total: number; completed: number; tasks: number; completedTasks: number }
    > = {};

    for (const a of assignments) {
      if (!map[a.subject]) {
        map[a.subject] = { total: 0, completed: 0, tasks: 0, completedTasks: 0 };
      }
      map[a.subject].total += 1;
      if (a.progress === 100) map[a.subject].completed += 1;

      const aTasks = tasks.filter((t) => t.assignmentId === a.id);
      map[a.subject].tasks += aTasks.length;
      map[a.subject].completedTasks += aTasks.filter((t) => t.completed).length;
    }

    return Object.entries(map)
      .map(([subject, data]) => ({ subject, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [assignments, tasks]);

  /* ── Activity grid (last 28 days) ───────────────────────────── */
  const activityGrid = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
      days.push({ date: dateStr, label, count: streakData.activityLog[dateStr] ?? 0 });
    }
    return days;
  }, [streakData.activityLog]);

  const maxActivity = Math.max(...activityGrid.map((d) => d.count), 1);

  /* ── Top assignments by study time ─────────────────────────── */
  const studyTimeAssignments = useMemo(
    () =>
      [...assignments]
        .filter((a) => (a.studyMinutes ?? 0) > 0)
        .sort((a, b) => (b.studyMinutes ?? 0) - (a.studyMinutes ?? 0))
        .slice(0, 5),
    [assignments],
  );

  const maxStudyMins = studyTimeAssignments.length > 0
    ? Math.max(...studyTimeAssignments.map((a) => a.estimatedHours * 60))
    : 1;

  return (
    <div className="pb-8">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 overflow-hidden px-5 pt-14 pb-6">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-violet-400/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-36 h-36 bg-indigo-300/20 rounded-full blur-2xl pointer-events-none" />
        <p className="relative text-indigo-200 text-[11px] font-bold tracking-[0.15em] mb-1">OVERVIEW</p>
        <h1 className="relative text-white text-2xl font-extrabold mb-0.5">Stats</h1>
        <p className="relative text-indigo-200 text-sm font-medium">Your study progress</p>
      </div>

      <div className="px-4 space-y-4 mt-4">
        {/* ── Pressure Meter ───────────────────────────────── */}
        <PressureMeter assignments={assignments} />

        {/* ── Streak card ──────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 overflow-hidden">
          <div className="bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlameIcon className="w-5 h-5 text-white" />
              <span className="text-white font-bold text-sm">Study Streak</span>
            </div>
            <span className="text-white/80 text-xs font-semibold bg-white/20 px-2.5 py-0.5 rounded-full">
              Best: {streakData.longestStreak}d
            </span>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-4xl font-extrabold text-gray-900 dark:text-white">
                {streakData.currentStreak}
              </span>
              <span className="text-gray-400 dark:text-gray-500 font-medium text-sm">
                day{streakData.currentStreak !== 1 ? 's' : ''} in a row
              </span>
            </div>

            {/* 28-day activity grid (4 rows × 7 cols) */}
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold tracking-widest mb-2">LAST 28 DAYS</p>
            <div className="grid grid-cols-7 gap-1.5">
              {activityGrid.map(({ date, count }) => {
                const intensity = count === 0 ? 0 : Math.max(0.2, count / maxActivity);
                return (
                  <div
                    key={date}
                    title={`${date}: ${count} activit${count !== 1 ? 'ies' : 'y'}`}
                    className="aspect-square rounded-md transition-colors"
                    style={{
                      background:
                        count === 0
                          ? 'var(--tw-prose-hr, #f3f4f6)'
                          : `rgba(99, 102, 241, ${intensity})`,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Overview chips ────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard value={totalAssignments} label="Total" color="text-indigo-600 dark:text-indigo-400" icon="📚" />
          <StatCard value={completedAssignments} label="Completed" color="text-emerald-600 dark:text-emerald-400" icon="✅" />
          <StatCard value={activeAssignments} label="In Progress" color="text-violet-600 dark:text-violet-400" icon="⚡" />
          <StatCard value={overdueAssignments} label="Overdue" color="text-red-500 dark:text-red-400" icon="⚠️" />
        </div>

        {/* ── Task progress ─────────────────────────────────── */}
        {totalTasks > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center">
                <ChartBarIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">Task Progress</h2>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {completedTasks} / {totalTasks} tasks done
              </span>
              <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                {totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%
              </span>
            </div>
            <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700"
                style={{ width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Study Time ─────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <ClockIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="font-bold text-gray-900 dark:text-white text-sm">Study Time</h2>
          </div>
          <div className="flex gap-4 mb-3">
            <div>
              <div className="text-2xl font-extrabold text-gray-900 dark:text-white">
                {Math.floor(totalStudyMinutes / 60)}h {totalStudyMinutes % 60}m
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 font-bold tracking-wide">LOGGED</div>
            </div>
            <div className="w-px bg-gray-100 dark:bg-gray-700" />
            <div>
              <div className="text-2xl font-extrabold text-gray-400 dark:text-gray-500">
                {Math.floor(totalEstimatedMinutes / 60)}h
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 font-bold tracking-wide">ESTIMATED</div>
            </div>
          </div>

          {studyTimeAssignments.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-gray-50 dark:border-gray-700">
              {studyTimeAssignments.map((a) => {
                const logged = a.studyMinutes ?? 0;
                const estimated = a.estimatedHours * 60;
                const pct = estimated > 0 ? Math.min((logged / maxStudyMins) * 100, 100) : 0;
                return (
                  <div
                    key={a.id}
                    onClick={() => navigate(`/assignments/${a.id}`)}
                    className="cursor-pointer group"
                  >
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate max-w-[60%] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {a.title}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {logged}m / {estimated}m
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {studyTimeAssignments.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">
              Start a study timer session to track your time.
            </p>
          )}
        </div>

        {/* ── Subject breakdown ─────────────────────────────── */}
        {subjectGroups.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center text-sm">
                📖
              </div>
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">By Subject</h2>
            </div>
            <div className="space-y-3">
              {subjectGroups.map(({ subject, total, completed, tasks: sTasks, completedTasks: sCTasks }) => {
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                return (
                  <div key={subject}>
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex-1 min-w-0 mr-2">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate block">
                          {subject}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {total} assignment{total !== 1 ? 's' : ''}
                          {sTasks > 0 ? ` · ${sCTasks}/${sTasks} tasks` : ''}
                        </span>
                      </div>
                      <span className={`text-sm font-bold shrink-0 ${pct === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          pct === 100
                            ? 'bg-gradient-to-r from-emerald-400 to-green-500'
                            : 'bg-gradient-to-r from-indigo-500 to-violet-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {assignments.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="text-5xl mb-3">📊</div>
            <h3 className="font-extrabold text-gray-900 dark:text-white text-lg mb-1">No data yet</h3>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              Add assignments and start studying to see your stats here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
  color,
  icon,
}: {
  value: number;
  label: string;
  color: string;
  icon: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 p-4 flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <div>
        <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500 font-bold tracking-wide">{label.toUpperCase()}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Pressure Meter component
 * ───────────────────────────────────────────────────────────────────────── */
function PressureMeter({ assignments }: { assignments: Assignment[] }) {
  const score    = calcPressureScore(assignments);
  const forecast = getPressureForecast(assignments);
  const level    = getPressureLevel(score);

  /* Top 3 assignments contributing most to pressure right now */
  const drivers = useMemo(() => {
    return assignments
      .filter((a) => a.progress < 100 && getDaysUntilDue(a.dueDate) <= 14)
      .map((a) => ({ a, pts: calcPressureScore([a]) }))
      .sort((x, y) => y.pts - x.pts)
      .slice(0, 3);
  }, [assignments]);

  /* Build SVG sparkline path */
  const SVG_W = 300;
  const SVG_H = 48;
  const maxF  = Math.max(...forecast, 1);

  const pts = forecast.map((v, i) => {
    const x = (i / (forecast.length - 1)) * SVG_W;
    const y = SVG_H - 4 - ((v / maxF) * (SVG_H - 10));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M ${pts.join(' L ')}`;
  const areaPath = `M 0,${SVG_H} L ${pts.join(' L ')} L ${SVG_W},${SVG_H} Z`;

  /* Threshold line for "critical" zone (80/100) */
  const critY = SVG_H - 4 - ((80 / maxF) * (SVG_H - 10));
  const showCritLine = maxF >= 50;

  const hasActiveWork = assignments.some((a) => a.progress < 100);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 overflow-hidden">

      {/* Card header */}
      <div className={`bg-gradient-to-r ${level.gradient} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{level.emoji}</span>
          <span className="text-white font-bold text-sm">Academic Pressure</span>
        </div>
        <span className="text-white/90 text-sm font-black bg-white/20 px-2.5 py-0.5 rounded-full">
          {score}/100
        </span>
      </div>

      <div className="p-4 space-y-4">

        {/* Score + gauge */}
        <div className="flex items-center gap-4">
          <div className="text-center shrink-0 w-16">
            <div className="text-4xl font-black text-gray-900 dark:text-white leading-none">{score}</div>
            <div className={`text-[10px] font-bold mt-1 ${level.textCls}`}>{level.label}</div>
          </div>

          <div className="flex-1">
            {/* Gauge bar */}
            <div className="relative h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${level.gradient} transition-all duration-700`}
                style={{ width: `${score}%` }}
              />
            </div>
            {/* Emoji scale */}
            <div className="flex justify-between mt-1.5 px-0.5">
              {['😌', '📚', '⚡', '🔥', '💥'].map((e) => (
                <span key={e} className="text-xs opacity-60 select-none">{e}</span>
              ))}
            </div>
          </div>
        </div>

        {/* 14-day forecast sparkline */}
        <div>
          <p className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 mb-2">
            14-DAY FORECAST
          </p>
          <div className="relative bg-gray-50 dark:bg-gray-900/40 rounded-xl px-2 pt-2 pb-1 overflow-hidden">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full"
              preserveAspectRatio="none"
              style={{ height: 52 }}
            >
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Area fill under the line */}
              <path d={areaPath} fill="url(#sparkFill)" />

              {/* Critical zone dashed threshold */}
              {showCritLine && (
                <line
                  x1="0" y1={critY} x2={SVG_W} y2={critY}
                  stroke="#ef4444" strokeWidth="1.5"
                  strokeDasharray="5 4" opacity="0.45"
                />
              )}

              {/* Line */}
              <path
                d={linePath} fill="none"
                stroke="#6366f1" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
              />

              {/* Today dot */}
              {pts[0] && (
                <circle
                  cx={pts[0].split(',')[0]} cy={pts[0].split(',')[1]}
                  r="4" fill="#6366f1"
                />
              )}
            </svg>

            {/* Day axis labels */}
            <div className="flex justify-between mt-0.5 pb-0.5">
              <span className="text-[9px] text-gray-400 font-semibold">Today</span>
              <span className="text-[9px] text-gray-400">+7d</span>
              <span className="text-[9px] text-gray-400 font-semibold">+14d</span>
            </div>
          </div>
          {showCritLine && (
            <p className="text-[9px] text-red-400 mt-1">
              — Red dashed line = critical threshold (80)
            </p>
          )}
        </div>

        {/* Pressure drivers */}
        {drivers.length > 0 && (
          <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 mb-2">
              TOP PRESSURE DRIVERS
            </p>
            <div className="space-y-2">
              {drivers.map(({ a }) => {
                const days = getDaysUntilDue(a.dueDate);
                const dotCls = days < 0
                  ? 'bg-red-500'
                  : days <= 2
                    ? 'bg-orange-500'
                    : days <= 5
                      ? 'bg-amber-400'
                      : 'bg-teal-400';
                const dayLabel = days < 0
                  ? `${Math.abs(days)}d overdue`
                  : days === 0
                    ? 'Due today'
                    : `${days}d left`;
                return (
                  <div key={a.id} className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex-1 truncate">
                      {a.title}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 font-medium">
                      {a.progress}% done · {dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!hasActiveWork && (
          <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-3">
            No active assignments — enjoy the break! 🎉
          </p>
        )}
      </div>
    </div>
  );
}
