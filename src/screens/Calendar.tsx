import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../stores/assignmentStore';
import { isOverdue } from '../utils';
import { DifficultyBadge } from '../components/common/Badge';
import { ProgressBar } from '../components/common/ProgressBar';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons';
import { parseISO, format, isSameDay, isToday } from 'date-fns';

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function Calendar() {
  const navigate = useNavigate();
  const assignments = useAssignmentStore((s) => s.assignments);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)); }

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  while (grid.length % 7 !== 0) grid.push(null);

  function assignmentsForDay(day: number) {
    const date = new Date(year, month, day);
    return assignments.filter((a) => {
      try { return isSameDay(parseISO(a.dueDate), date); }
      catch { return false; }
    });
  }

  const selectedAssignments = assignments.filter((a) => {
    try { return isSameDay(parseISO(a.dueDate), selectedDate); }
    catch { return false; }
  });

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

      {/* ── Calendar card ─────────────────────────────────────── */}
      <div className="mx-4 -mt-3 bg-white dark:bg-gray-800 rounded-2xl shadow-lg shadow-indigo-200/40 dark:shadow-gray-900/40 overflow-hidden relative z-10">
        {/* Day headers */}
        <div className="grid grid-cols-7 px-2 pt-3 pb-1">
          {DAY_NAMES.map((d, i) => (
            <div key={`${d}-${i}`} className="text-center text-[11px] text-gray-400 dark:text-gray-500 font-bold py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 px-2 pb-3 gap-y-0.5">
          {grid.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;

            const date = new Date(year, month, day);
            const dayAssignments = assignmentsForDay(day);
            const isSelected = isSameDay(date, selectedDate);
            const today = isToday(date);

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
                <span
                  className={`text-sm font-bold ${
                    isSelected
                      ? 'text-white'
                      : today
                        ? 'text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {day}
                </span>
                {dayAssignments.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayAssignments.slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected
                            ? 'bg-white/70'
                            : isOverdue(a)
                              ? 'bg-red-500'
                              : a.progress === 100
                                ? 'bg-emerald-500'
                                : 'bg-violet-500'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Selected day ──────────────────────────────────────── */}
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm">
            {isToday(selectedDate)
              ? "Today's Deadlines"
              : format(selectedDate, 'EEEE, MMMM d')}
          </h3>
          {selectedAssignments.length > 0 && (
            <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-2.5 py-0.5 rounded-full">
              {selectedAssignments.length} due
            </span>
          )}
        </div>

        {selectedAssignments.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 text-center shadow-sm">
            <p className="text-2xl mb-1">✓</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">Nothing due on this day</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {selectedAssignments.map((a) => (
              <div
                key={a.id}
                onClick={() => navigate(`/assignments/${a.id}`)}
                className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm shadow-indigo-100/50 dark:shadow-gray-900/30 cursor-pointer active:scale-[0.98] transition-all"
              >
                <div
                  className={`h-1 bg-gradient-to-r ${
                    isOverdue(a)
                      ? 'from-red-500 to-rose-400'
                      : a.progress === 100
                        ? 'from-emerald-500 to-green-400'
                        : 'from-indigo-500 to-violet-500'
                  }`}
                />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mb-0.5">{a.subject}</p>
                      <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{a.title}</p>
                    </div>
                    <DifficultyBadge difficulty={a.difficulty} />
                  </div>
                  <div className="flex items-center gap-2">
                    <ProgressBar progress={a.progress} className="flex-1" />
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{a.progress}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
