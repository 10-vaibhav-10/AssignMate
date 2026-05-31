import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../stores/assignmentStore';
import { useTaskStore } from '../stores/taskStore';
import { useStreakStore } from '../stores/streakStore';
import { isOverdue } from '../utils';
import { FlameIcon, ClockIcon, ChartBarIcon } from '../components/Icons';

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
