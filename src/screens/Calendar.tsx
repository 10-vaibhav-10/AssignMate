import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../stores/assignmentStore';
import { useTaskStore } from '../stores/taskStore';
import { isOverdue } from '../utils';
import { DifficultyBadge } from '../components/common/Badge';
import { ProgressBar } from '../components/common/ProgressBar';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons';
import { parseISO, format, isSameDay, isToday, startOfDay } from 'date-fns';

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function Calendar() {
  const navigate    = useNavigate();
  const assignments = useAssignmentStore((s) => s.assignments);
  const tasks       = useTaskStore((s) => s.tasks);

  const [viewDate,      setViewDate]      = useState(new Date());
  const [selectedDate,  setSelectedDate]  = useState(new Date());

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)); }

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth    = new Date(year, month + 1, 0).getDate();
  const grid: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  while (grid.length % 7 !== 0) grid.push(null);

  /* ── Grid dot helpers (exact-day, for the calendar grid) ─────── */
  function assignmentsForDay(day: number) {
    const date = new Date(year, month, day);
    return assignments.filter((a) => {
      try { return isSameDay(parseISO(a.dueDate), date); }
      catch { return false; }
    });
  }

  function tasksForDay(day: number) {
    const date = new Date(year, month, day);
    return tasks.filter((t) => {
      if (!t.dueDate || t.completed) return false;
      try { return isSameDay(parseISO(t.dueDate), date); }
      catch { return false; }
    });
  }

  /* ── All upcoming from selectedDate onward ───────────────────── */
  const windowStart = startOfDay(selectedDate);

  const upcomingAssignments = assignments
    .filter((a) => {
      if (a.progress >= 100) return false;
      try {
        const due = startOfDay(parseISO(a.dueDate));
        return due >= windowStart;
      } catch { return false; }
    })
    .sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());

  const upcomingTasks = tasks
    .filter((t) => {
      if (!t.dueDate || t.completed) return false;
      try {
        const due = startOfDay(parseISO(t.dueDate));
        return due >= windowStart;
      } catch { return false; }
    })
    .sort((a, b) => parseISO(a.dueDate!).getTime() - parseISO(b.dueDate!).getTime());

  const windowLabel = isToday(selectedDate) ? 'From today onward' : `From ${format(windowStart, 'MMM d')} onward`;

  /* ── Due-date chip helper ────────────────────────────────────── */
  function dueDateLabel(dateStr: string): { text: string; urgent: boolean } {
    const due  = startOfDay(parseISO(dateStr));
    const diff = Math.round((due.getTime() - windowStart.getTime()) / 86_400_000);
    if (diff === 0) return { text: 'Today',    urgent: true  };
    if (diff === 1) return { text: 'Tomorrow', urgent: true  };
    return { text: format(due, 'MMM d'), urgent: diff <= 2 };
  }

  return (
    <div className="pb-4">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 overflow-hidden px-5 pt-14 pb-5">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-violet-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <div className="text-center">
            <h2 className="font-extrabold text-white text-lg">{format(viewDate, 'MMMM')}</h2>
            <p className="text-indigo-200 text-xs font-medium">{format(viewDate, 'yyyy')}</p>
          </div>
          <button
            onClick={nextMonth}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Calendar grid ─────────────────────────────────────── */}
      <div className="mx-4 -mt-3 bg-white dark:bg-gray-800 rounded-2xl shadow-lg shadow-indigo-200/40 dark:shadow-gray-900/40 overflow-hidden relative z-10">
        <div className="grid grid-cols-7 px-2 pt-3 pb-1">
          {DAY_NAMES.map((d, i) => (
            <div key={`${d}-${i}`} className="text-center text-[11px] text-gray-400 dark:text-gray-500 font-bold py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 px-2 pb-3 gap-y-0.5">
          {grid.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;

            const date           = new Date(year, month, day);
            const dayAssignments = assignmentsForDay(day);
            const dayTasks       = tasksForDay(day);
            const isSelected     = isSameDay(date, selectedDate);
            const today          = isToday(date);

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(date)}
                className={`relative flex flex-col items-center py-2 rounded-xl transition-all duration-150 ${
                  isSelected
                    ? 'bg-gradient-to-b from-indigo-600 to-violet-600 shadow-md shadow-indigo-300/50'
                    : today
                      ? 'bg-indigo-50 dark:bg-indigo-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className={`text-sm font-bold ${
                  isSelected ? 'text-white' : today ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {day}
                </span>
                {(dayAssignments.length > 0 || dayTasks.length > 0) && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayAssignments.slice(0, 2).map((a) => (
                      <div key={a.id} className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-white/70' : isOverdue(a) ? 'bg-red-500' : a.progress === 100 ? 'bg-emerald-500' : 'bg-violet-500'
                      }`} />
                    ))}
                    {dayTasks.slice(0, 2).map((t) => (
                      <div key={t.id} className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/50' : 'bg-amber-400'}`} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Upcoming panel ────────────────────────────────────── */}
      <div className="px-4 mt-4 space-y-4">

        {/* Section header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">
              {isToday(selectedDate) ? 'Coming up' : `From ${format(selectedDate, 'MMM d')}`}
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{windowLabel}</p>
          </div>
          {(upcomingAssignments.length + upcomingTasks.length) > 0 && (
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-0.5 rounded-full">
              {upcomingAssignments.length + upcomingTasks.length} items
            </span>
          )}
        </div>

        {/* Upcoming assignments */}
        {upcomingAssignments.length > 0 && (
          <div>
            <p className="text-[11px] font-bold tracking-widest text-violet-500 dark:text-violet-400 mb-2 px-1">
              ASSIGNMENTS
            </p>
            <div className="space-y-2.5">
              {upcomingAssignments.map((a) => {
                const { text: dueText, urgent } = dueDateLabel(a.dueDate);
                return (
                  <div
                    key={a.id}
                    onClick={() => navigate(`/assignments/${a.id}`)}
                    className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm shadow-indigo-100/50 dark:shadow-gray-900/30 cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <div className={`h-1 bg-gradient-to-r ${
                      isOverdue(a) ? 'from-red-500 to-rose-400' : a.progress === 100 ? 'from-emerald-500 to-green-400' : 'from-indigo-500 to-violet-500'
                    }`} />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mb-0.5">{a.subject}</p>
                          <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{a.title}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <DifficultyBadge difficulty={a.difficulty} />
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            urgent
                              ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                              : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                          }`}>
                            {dueText}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <ProgressBar progress={a.progress} className="flex-1" />
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{a.progress}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upcoming tasks */}
        {upcomingTasks.length > 0 && (
          <div>
            <p className="text-[11px] font-bold tracking-widest text-amber-500 dark:text-amber-400 mb-2 px-1">
              TASKS
            </p>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 overflow-hidden">
              {upcomingTasks.map((task, i) => {
                const parent = assignments.find(a => a.id === task.assignmentId);
                const { text: dueText, urgent } = dueDateLabel(task.dueDate!);
                return (
                  <div
                    key={task.id}
                    onClick={() => parent && navigate(`/assignments/${parent.id}`)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-amber-50/60 dark:active:bg-amber-900/20 transition-colors ${
                      i !== 0 ? 'border-t border-gray-50 dark:border-gray-700' : ''
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0 bg-amber-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-gray-800 dark:text-gray-200">
                        {task.title}
                      </p>
                      {parent && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                          {parent.subject} · {parent.title}
                        </p>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      urgent
                        ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                        : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                    }`}>
                      {dueText}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {upcomingAssignments.length === 0 && upcomingTasks.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 text-center shadow-sm">
            <p className="text-2xl mb-1">🎉</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Nothing coming up</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              No assignments or tasks from this date onward.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
