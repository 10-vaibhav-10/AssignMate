import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAssignmentStore } from '../stores/assignmentStore';
import { useTaskStore } from '../stores/taskStore';
import { analyzeAssignment } from '../services/ai';
import { toast } from '../stores/toastStore';
import { formatDueDate, isOverdue, getDaysUntilDue, offsetDate } from '../utils';
import { cancelNotificationsForAssignment, rescheduleAll } from '../services/notifications';
import { DifficultyBadge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import {
  ChevronLeftIcon, PencilIcon, SparklesIcon, TrashIcon,
  CheckCircleIcon, ExclamationIcon, TimerIcon, ClockIcon,
} from '../components/Icons';
import type { AiStatus, StudyPlanDay } from '../types';

const PRIORITY_CONFIG = {
  urgent: { label: '🔥 Urgent', cls: 'bg-red-400/40 text-red-100' },
  normal: null,
  low:    { label: '🌿 Low',    cls: 'bg-emerald-400/30 text-emerald-100' },
} as const;

export default function AssignmentDetail() {
  const navigate = useNavigate();
  const { id }   = useParams<{ id: string }>();

  const assignments      = useAssignmentStore((s) => s.assignments);
  const updateAssignment = useAssignmentStore((s) => s.update);
  const removeAssignment = useAssignmentStore((s) => s.remove);

  const tasks             = useTaskStore((s) => s.tasks);
  const addTasks          = useTaskStore((s) => s.addTasks);
  const toggleTask        = useTaskStore((s) => s.toggle);
  const reorderTask       = useTaskStore((s) => s.reorder);
  const removeByAssignment = useTaskStore((s) => s.removeByAssignment);

  const [aiStatus, setAiStatus]       = useState<AiStatus>('idle');
  const [aiError, setAiError]         = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [studyPlanExpanded, setStudyPlanExpanded] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask]    = useState(false);

  const assignment = assignments.find((a) => a.id === id);

  /* Sort tasks by order field */
  const assignmentTasks = tasks
    .filter((t) => t.assignmentId === id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (!assignment) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
        Assignment not found
      </div>
    );
  }

  const overdue    = isOverdue(assignment);
  const daysLeft   = getDaysUntilDue(assignment.dueDate);
  const studyPlan: StudyPlanDay[] = assignment.aiStudyPlan
    ? (JSON.parse(assignment.aiStudyPlan) as StudyPlanDay[])
    : [];

  const headerGradient = overdue
    ? 'from-red-600 via-red-500 to-rose-500'
    : 'from-indigo-700 via-indigo-600 to-violet-700';

  const loggedMinutes    = assignment.studyMinutes ?? 0;
  const estimatedMinutes = assignment.estimatedHours * 60;
  const timePct = estimatedMinutes > 0
    ? Math.min((loggedMinutes / estimatedMinutes) * 100, 100)
    : 0;

  /* ── AI analysis ──────────────────────────────────────────────── */
  async function handleAnalyze() {
    if (!assignment) return;
    const snap = assignment;
    setAiStatus('loading');
    setAiError(null);
    try {
      const response = await analyzeAssignment(snap);
      updateAssignment(snap.id, {
        aiExplanation: response.explanation,
        aiStudyPlan:   JSON.stringify(response.studyPlan),
      });
      // Always refresh tasks from AI — remove old AI tasks and create new ones
      // so the task list stays in sync with the updated study plan.
      removeByAssignment(snap.id);
      const freshTasks = response.tasks.map((t, i) => ({
        id:           crypto.randomUUID(),
        assignmentId: snap.id,
        title:        t.title,
        completed:    false,
        dueDate:      offsetDate(t.dueDateOffset),
        order:        i,
      }));
      addTasks(freshTasks);
      // Reset progress since tasks were replaced
      updateAssignment(snap.id, { progress: 0 });
      setAiStatus('success');
      const verb = snap.aiExplanation ? 'updated' : 'complete';
      toast.success(`AI analysis ${verb}! ✨`);
      // Reschedule so new task dates are reflected in notifications
      rescheduleAll(useAssignmentStore.getState().assignments);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
      setAiError(msg);
      setAiStatus('error');
      toast.error('AI analysis failed — check your API key.');
    }
  }

  /* ── Task toggle ──────────────────────────────────────────────── */
  function handleToggleTask(taskId: string) {
    if (!assignment) return;
    toggleTask(taskId);
    const updatedTasks = assignmentTasks.map((t) =>
      t.id === taskId ? { ...t, completed: !t.completed } : t,
    );
    const completed = updatedTasks.filter((t) => t.completed).length;
    const progress  =
      updatedTasks.length > 0
        ? Math.round((completed / updatedTasks.length) * 100)
        : 0;
    updateAssignment(assignment.id, { progress });

    /* When all tasks are done, mark 100% and cancel any pending reminders */
    if (completed === updatedTasks.length && updatedTasks.length > 0) {
      toast.success('All tasks complete — assignment done! 🎉');
      cancelNotificationsForAssignment(assignment.id).catch(console.error);
    }
  }

  /* ── Manual task entry ───────────────────────────────────────────── */
  function handleAddManualTask() {
    const title = newTaskTitle.trim();
    if (!title || !assignment) return;
    const maxOrder = assignmentTasks.reduce((m, t) => Math.max(m, t.order ?? 0), -1);
    addTasks([{
      id:           crypto.randomUUID(),
      assignmentId: assignment.id,
      title,
      completed:    false,
      order:        maxOrder + 1,
    }]);
    setNewTaskTitle('');
    // Keep form open so user can chain-add tasks
  }

  /* ── Delete ────────────────────────────────────────────────────── */
  function handleDelete() {
    if (!assignment) return;
    // Cancel pending notifications for this assignment before removing data
    cancelNotificationsForAssignment(assignment.id).catch(console.error);
    removeAssignment(assignment.id);
    removeByAssignment(assignment.id);
    // Reschedule remaining assignments (removes cancelled ones from the queue)
    const remaining = useAssignmentStore.getState().assignments;
    rescheduleAll(remaining);
    toast.success('Assignment deleted.');
    navigate('/assignments');
  }

  return (
    <div className="pb-8">
      {/* ── Gradient Header ─────────────────────────────── */}
      <div className={`relative bg-gradient-to-br ${headerGradient} overflow-hidden px-5 pt-12 pb-6`}>
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        {/* Top nav */}
        <div className="relative flex items-center justify-between mb-5">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white"
          >
            <ChevronLeftIcon />
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={() => navigate(`/assignments/${assignment.id}/timer`)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white"
              title="Study Timer"
            >
              <TimerIcon />
            </button>
            <button
              onClick={() => navigate(`/assignments/${assignment.id}/edit`)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white"
            >
              <PencilIcon />
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-red-400/60 text-white"
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        {/* Overdue banner */}
        {overdue && (
          <div className="relative flex items-center gap-1.5 text-red-100 text-xs font-bold mb-2">
            <ExclamationIcon className="w-3.5 h-3.5" />
            OVERDUE
          </div>
        )}

        <h1 className="relative text-white text-xl font-extrabold leading-snug mb-0.5">
          {assignment.title}
        </h1>
        <p className="relative text-white/70 text-sm mb-4">{assignment.subject}</p>

        {/* Meta chips */}
        <div className="relative flex flex-wrap gap-2 mb-4">
          <DifficultyBadge difficulty={assignment.difficulty} />

          {/* Priority (skip 'normal') */}
          {assignment.priority && assignment.priority !== 'normal' && (
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${PRIORITY_CONFIG[assignment.priority]?.cls}`}>
              {PRIORITY_CONFIG[assignment.priority]?.label}
            </span>
          )}

          <span className="text-[11px] font-bold bg-white/20 text-white px-2.5 py-0.5 rounded-full">
            {assignment.estimatedHours}h est.
          </span>

          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
            overdue ? 'bg-red-400/40 text-red-100' : 'bg-white/20 text-white'
          }`}>
            {overdue
              ? `Due ${formatDueDate(assignment.dueDate)}`
              : daysLeft === 0
                ? '📅 Due today'
                : `⏳ ${daysLeft}d left`}
          </span>

          {loggedMinutes > 0 && (
            <span className="text-[11px] font-bold bg-white/20 text-white px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              {loggedMinutes}m logged
            </span>
          )}

          {/* Weight chip — e.g. "Worth 25%" */}
          {assignment.weight && assignment.weight !== '0%' && (
            <span className="text-[11px] font-bold bg-white/20 text-white px-2.5 py-0.5 rounded-full">
              🎯 Worth {assignment.weight}
            </span>
          )}

          {/* Grade chip */}
          {assignment.grade !== undefined && (
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
              assignment.grade >= 80
                ? 'bg-emerald-400/40 text-emerald-100'
                : assignment.grade >= 60
                  ? 'bg-amber-400/40 text-amber-100'
                  : 'bg-red-400/40 text-red-100'
            }`}>
              Grade: {assignment.grade}%
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="relative">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-white/70 text-xs font-medium">Progress</span>
            <span className="text-white text-xs font-bold">{assignment.progress}%</span>
          </div>
          <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
              style={{ width: `${assignment.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="px-4 space-y-4 mt-4">

        {/* ── Study Time ────────────────────────────────────────── */}
        {(loggedMinutes > 0 || assignment.estimatedHours > 0) && (
          <section>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                  <ClockIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="font-bold text-gray-900 dark:text-white text-sm">Study Time</h2>
                <button
                  onClick={() => navigate(`/assignments/${assignment.id}/timer`)}
                  className="ml-auto text-xs text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1"
                >
                  <TimerIcon className="w-3 h-3" />
                  Start Timer
                </button>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {loggedMinutes > 0 ? `${loggedMinutes} min logged` : 'No time logged yet'}
                </span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  / {estimatedMinutes} min est.
                </span>
              </div>
              <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    timePct >= 100
                      ? 'bg-gradient-to-r from-emerald-400 to-green-500'
                      : 'bg-gradient-to-r from-amber-400 to-orange-500'
                  }`}
                  style={{ width: `${timePct}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 text-right">
                {timePct.toFixed(0)}% of estimated time
              </p>
            </div>
          </section>
        )}

        {/* ── AI Analysis ──────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center">
              <SparklesIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="font-bold text-gray-900 dark:text-white text-sm">AI Analysis</h2>
          </div>

          {!assignment.aiExplanation && aiStatus !== 'loading' && (
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/40 rounded-2xl p-4 border border-indigo-100 dark:border-indigo-900/40">
              <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-3 leading-relaxed">
                Let AI analyse your assignment and generate a personalised study plan with task breakdown.
              </p>
              {aiStatus === 'error' && (
                <p className="text-red-600 dark:text-red-400 text-xs mb-3 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-xl border border-red-100 dark:border-red-900/40">
                  {aiError}
                </p>
              )}
              <Button onClick={handleAnalyze} className="w-full">
                <SparklesIcon className="w-4 h-4" />
                {aiStatus === 'error' ? 'Try Again' : 'Analyse with AI'}
              </Button>
            </div>
          )}

          {aiStatus === 'loading' && (
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/40 rounded-2xl p-5 flex items-center gap-3 border border-indigo-100 dark:border-indigo-900/40">
              <svg className="animate-spin w-5 h-5 text-indigo-600 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <div>
                <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">Analysing your assignment…</p>
                <p className="text-xs text-indigo-400 dark:text-indigo-500 mt-0.5">This may take a few seconds</p>
              </div>
            </div>
          )}

          {assignment.aiExplanation && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 overflow-hidden">
              <div className="p-4 border-b border-gray-50 dark:border-gray-700">
                <p className="text-[10px] font-bold tracking-widest text-violet-600 dark:text-violet-400 mb-2">
                  ASSIGNMENT EXPLAINED
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {assignment.aiExplanation}
                </p>
              </div>

              {studyPlan.length > 0 && (
                <div className="p-4">
                  <button
                    onClick={() => setStudyPlanExpanded(!studyPlanExpanded)}
                    className="flex items-center justify-between w-full"
                  >
                    <p className="text-[10px] font-bold tracking-widest text-violet-600 dark:text-violet-400">
                      STUDY PLAN
                    </p>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                      {studyPlanExpanded ? 'Hide ↑' : 'Show ↓'}
                    </span>
                  </button>
                  {studyPlanExpanded && (
                    <div className="mt-3 space-y-3">
                      {studyPlan.map((day) => (
                        <div key={day.date}>
                          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">
                            {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
                              weekday: 'short', month: 'short', day: 'numeric',
                            })}
                          </p>
                          <ul className="space-y-1">
                            {day.tasks.map((t, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                <span className="text-violet-400 mt-0.5">•</span>
                                {t}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="px-4 pb-3 border-t border-gray-50 dark:border-gray-700">
                <button
                  onClick={handleAnalyze}
                  className="mt-2 text-xs text-gray-400 dark:text-gray-500 hover:text-violet-500 dark:hover:text-violet-400 flex items-center gap-1 transition-colors"
                >
                  <SparklesIcon className="w-3 h-3" />
                  Re-analyse
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Tasks ────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 dark:text-white text-sm">
              Tasks
              {assignmentTasks.length > 0 && (
                <span className="ml-2 text-gray-400 dark:text-gray-500 font-normal text-xs">
                  {assignmentTasks.filter((t) => t.completed).length}/{assignmentTasks.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => setAddingTask(true)}
              className="text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-3 py-1 rounded-full hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
            >
              + Add task
            </button>
          </div>

          {assignmentTasks.length === 0 && !addingTask && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 text-center border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {assignment.aiExplanation ? 'No tasks generated.' : 'Tasks will appear after AI analysis.'}
              </p>
            </div>
          )}

          {assignmentTasks.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 overflow-hidden">
              {assignmentTasks.map((task, i) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 px-4 py-3.5 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-colors ${
                    i !== 0 ? 'border-t border-gray-50 dark:border-gray-700' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleToggleTask(task.id)}
                    className="w-4 h-4 rounded shrink-0 cursor-pointer accent-violet-600"
                  />

                  {/* Title */}
                  <span
                    className={`text-sm flex-1 leading-snug cursor-pointer ${
                      task.completed
                        ? 'line-through text-gray-400 dark:text-gray-500'
                        : 'text-gray-700 dark:text-gray-200'
                    }`}
                    onClick={() => handleToggleTask(task.id)}
                  >
                    {task.title}
                  </span>

                  {/* Due date */}
                  {task.dueDate && !task.completed && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 font-medium">
                      {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </span>
                  )}

                  {/* Done indicator */}
                  {task.completed && (
                    <CheckCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}

                  {/* Reorder buttons */}
                  {!task.completed && (
                    <div className="flex flex-col gap-0.5 shrink-0 ml-1">
                      <button
                        onClick={() => reorderTask(task.id, 'up', assignment.id)}
                        disabled={i === 0 || assignmentTasks[i - 1]?.completed}
                        className="w-5 h-4 flex items-center justify-center rounded text-gray-300 dark:text-gray-600 hover:text-violet-500 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40 disabled:opacity-0 transition-all text-[10px] leading-none"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => reorderTask(task.id, 'down', assignment.id)}
                        disabled={
                          i === assignmentTasks.length - 1 ||
                          assignmentTasks[i + 1]?.completed
                        }
                        className="w-5 h-4 flex items-center justify-center rounded text-gray-300 dark:text-gray-600 hover:text-violet-500 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40 disabled:opacity-0 transition-all text-[10px] leading-none"
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Inline "Add task" form ─────────────────────────── */}
          {addingTask && (
            <div className="mt-2 flex gap-2">
              <input
                autoFocus
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddManualTask();
                  if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle(''); }
                }}
                placeholder="Task description…"
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40"
              />
              <button
                onClick={handleAddManualTask}
                disabled={!newTaskTitle.trim()}
                className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-40 active:scale-95 transition-all"
              >
                Add
              </button>
              <button
                onClick={() => { setAddingTask(false); setNewTaskTitle(''); }}
                className="px-3 py-2.5 rounded-xl text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 text-sm"
              >
                ✕
              </button>
            </div>
          )}
        </section>

        {/* ── Assignment Brief ─────────────────────────────── */}
        {assignment.details && (
          <section>
            <h2 className="font-bold text-gray-900 dark:text-white text-sm mb-3">Assignment Brief</h2>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm shadow-indigo-100/40 dark:shadow-gray-900/30 p-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {assignment.details}
              </p>
            </div>
          </section>
        )}
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete assignment?"
        message={`"${assignment.title}" and all its tasks will be permanently deleted.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
