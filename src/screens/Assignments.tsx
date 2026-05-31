import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssignmentStore } from '../stores/assignmentStore';
import { useTaskStore } from '../stores/taskStore';
import { isOverdue, formatDueDate, formatRelativeDue } from '../utils';
import { DifficultyBadge } from '../components/common/Badge';
import { ProgressBar } from '../components/common/ProgressBar';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import {
  TrashIcon, PlusIcon, DocumentArrowUpIcon,
  ChevronRightIcon, CheckIcon,
} from '../components/Icons';
import { useSwipe } from '../hooks/useSwipe';
import type { Assignment } from '../types';

type Filter = 'all' | 'active' | 'completed' | 'overdue';
type View = 'subjects' | 'list';

/* ── Per-subject colour config ───────────────────────────────────── */
interface SubjectConfig {
  gradient: string;
  shadow: [number, number, number]; // rgb
}

const SUBJECT_CONFIGS: SubjectConfig[] = [
  { gradient: 'from-violet-600 to-purple-700',  shadow: [124, 58,  237] },
  { gradient: 'from-sky-500 to-indigo-600',      shadow: [14,  165, 233] },
  { gradient: 'from-emerald-500 to-teal-700',    shadow: [16,  185, 129] },
  { gradient: 'from-rose-500 to-pink-700',       shadow: [244, 63,  94]  },
  { gradient: 'from-amber-500 to-orange-600',    shadow: [245, 158, 11]  },
  { gradient: 'from-fuchsia-500 to-violet-700',  shadow: [217, 70,  239] },
];

function getSubjectConfig(subject: string): SubjectConfig {
  let h = 0;
  for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) & 0xffff;
  return SUBJECT_CONFIGS[h % SUBJECT_CONFIGS.length];
}

function cardShadow([r, g, b]: [number, number, number], strength = 0.28): string {
  return `0 12px 36px -8px rgba(${r},${g},${b},${strength}), 0 4px 12px -4px rgba(${r},${g},${b},0.14)`;
}

export default function Assignments() {
  const navigate = useNavigate();
  const assignments = useAssignmentStore((s) => s.assignments);
  const remove = useAssignmentStore((s) => s.remove);
  const tasks = useTaskStore((s) => s.tasks);
  const removeByAssignment = useTaskStore((s) => s.removeByAssignment);

  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<View>('subjects');
  const [search, setSearch] = useState('');
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());

  /* ── Single-delete ───────────────────────────────────────────── */
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);

  /* ── Multi-select ────────────────────────────────────────────── */
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);

  /* ── Derived lists ───────────────────────────────────────────── */
  const filtered = assignments
    .filter((a) => {
      if (filter === 'active') return a.progress < 100 && !isOverdue(a);
      if (filter === 'completed') return a.progress === 100;
      if (filter === 'overdue') return isOverdue(a);
      return true;
    })
    .filter((a) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return a.title.toLowerCase().includes(q) || a.subject.toLowerCase().includes(q);
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const subjectGroups: [string, Assignment[]][] = (() => {
    const map: Record<string, Assignment[]> = {};
    for (const a of filtered) {
      if (!map[a.subject]) map[a.subject] = [];
      map[a.subject].push(a);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  })();

  /* ── Helpers ─────────────────────────────────────────────────── */
  function toggleSubject(subject: string) {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  }

  function enterSelectMode() {
    setSelectMode(true);
    setSelectedIds(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getGroupState(subAssignments: Assignment[]): 'none' | 'some' | 'all' {
    const n = subAssignments.filter((a) => selectedIds.has(a.id)).length;
    if (n === 0) return 'none';
    if (n === subAssignments.length) return 'all';
    return 'some';
  }

  function toggleGroupSelect(subAssignments: Assignment[]) {
    const state = getGroupState(subAssignments);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (state === 'all') subAssignments.forEach((a) => next.delete(a.id));
      else subAssignments.forEach((a) => next.add(a.id));
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map((a) => a.id)));
  }
  function deselectAll() {
    setSelectedIds(new Set());
  }

  /* ── Delete handlers ─────────────────────────────────────────── */
  function handleSingleDelete() {
    if (!deleteTarget) return;
    remove(deleteTarget.id);
    removeByAssignment(deleteTarget.id);
    setDeleteTarget(null);
  }

  function handleBulkDelete() {
    for (const id of selectedIds) {
      remove(id);
      removeByAssignment(id);
    }
    setBulkDeletePending(false);
    exitSelectMode();
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Done' },
    { key: 'overdue', label: 'Overdue' },
  ];

  const selectedCount = selectedIds.size;
  const allSelected = filtered.length > 0 && selectedCount === filtered.length;

  return (
    <div className="pb-4">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="bg-white/80 dark:bg-[#0f0f1e]/90 backdrop-blur-xl px-5 pt-14 pb-4 border-b border-violet-100/60 dark:border-violet-900/20 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-4">
          {selectMode ? (
            <>
              <div>
                <h1 className="text-xl font-black text-gray-900 dark:text-white">
                  {selectedCount > 0 ? `${selectedCount} selected` : 'Select Assignments'}
                </h1>
                <button
                  onClick={allSelected ? deselectAll : selectAll}
                  className="text-sm text-violet-600 dark:text-violet-400 font-bold mt-0.5"
                >
                  {allSelected ? 'Deselect all' : `Select all ${filtered.length}`}
                </button>
              </div>
              <button
                onClick={exitSelectMode}
                className="px-4 h-9 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Assignments</h1>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold mt-0.5">
                  {assignments.length} total · {subjectGroups.length} subject{subjectGroups.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {filtered.length > 0 && (
                  <button
                    onClick={enterSelectMode}
                    className="px-3 h-9 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    Select
                  </button>
                )}
                <button
                  onClick={() => setView(view === 'subjects' ? 'list' : 'subjects')}
                  className={`px-3 h-9 rounded-2xl text-xs font-bold transition-all ${
                    view === 'subjects'
                      ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-300/40'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {view === 'subjects' ? '📚 Grouped' : '≡ List'}
                </button>
                <button
                  onClick={() => navigate('/assignments/import')}
                  className="w-9 h-9 bg-violet-50 dark:bg-violet-900/25 rounded-2xl flex items-center justify-center text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
                >
                  <DocumentArrowUpIcon className="w-4.5 h-4.5" />
                </button>
                <button
                  onClick={() => navigate('/assignments/new')}
                  className="w-9 h-9 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-violet-400/35 transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7, #d946ef)' }}
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Filter chips + search — hidden in select mode */}
        {!selectMode && (
          <>
            <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-4 py-1.5 rounded-2xl text-xs font-black whitespace-nowrap transition-all ${
                    filter === f.key
                      ? 'text-white shadow-md shadow-violet-300/35'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  style={
                    filter === f.key
                      ? { background: 'linear-gradient(135deg, #7c3aed, #a855f7, #d946ef)' }
                      : undefined
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search bar */}
            <div className="relative mt-2.5">
              <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search by title or subject…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-2xl bg-gray-100 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-900/40 transition-all border border-transparent focus:border-violet-200 dark:focus:border-violet-800"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="px-4 pt-3">
        {filtered.length === 0 ? (
          /* Empty state */
          filter === 'all' ? (
            <div className="space-y-3 mt-2">
              <button
                onClick={() => navigate('/assignments/import')}
                className="w-full rounded-3xl p-5 flex items-center gap-4 text-left active:scale-[0.98] transition-all shadow-xl shadow-violet-400/20"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 60%, #d946ef 100%)' }}
              >
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 border border-white/25">
                  <DocumentArrowUpIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-black text-white text-sm">Import subject outline</p>
                  <p className="text-white/70 text-xs mt-0.5 font-semibold">
                    Upload PDF — AI extracts all assignments
                  </p>
                </div>
              </button>
              <button
                onClick={() => navigate('/assignments/new')}
                className="w-full bg-white dark:bg-[#111128] rounded-3xl border border-violet-100 dark:border-violet-900/25 p-5 flex items-center gap-4 text-left hover:border-violet-300 dark:hover:border-violet-700 transition-all shadow-sm"
              >
                <div className="w-12 h-12 bg-violet-50 dark:bg-violet-950/40 rounded-2xl flex items-center justify-center shrink-0">
                  <PlusIcon className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="font-black text-gray-900 dark:text-white text-sm">Add manually</p>
                  <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5 font-semibold">
                    Enter assignment details yourself
                  </p>
                </div>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="text-5xl mb-3">📝</div>
              <p className="text-gray-500 dark:text-gray-400 font-bold">
                No {filter} assignments
              </p>
            </div>
          )
        ) : view === 'subjects' ? (
          /* ──────────────────────────────────────────────────────────
             SUBJECT GROUPS VIEW
             ────────────────────────────────────────────────────────── */
          <div className="space-y-4">
            {subjectGroups.map(([subject, subAssignments]) => {
              const cfg = getSubjectConfig(subject);
              const isExpanded = expandedSubjects.has(subject);
              const groupState = getGroupState(subAssignments);
              const subTasks = tasks.filter((t) =>
                subAssignments.some((a) => a.id === t.assignmentId),
              );
              const completedTasks = subTasks.filter((t) => t.completed).length;
              const completedAssignments = subAssignments.filter(
                (a) => a.progress === 100,
              ).length;
              const overdueCount = subAssignments.filter(isOverdue).length;
              const overallPct =
                subAssignments.length > 0
                  ? Math.round((completedAssignments / subAssignments.length) * 100)
                  : 0;

              return (
                <div
                  key={subject}
                  className="rounded-3xl overflow-hidden"
                  style={{ boxShadow: cardShadow(cfg.shadow) }}
                >
                  {/* ── Gradient header ──────────────────────── */}
                  <div className={`bg-gradient-to-br ${cfg.gradient} px-4 pt-4 pb-4`}>
                    <div className="flex items-start gap-3">
                      {/* Group checkbox (select mode) */}
                      {selectMode && (
                        <button
                          onClick={() => toggleGroupSelect(subAssignments)}
                          className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                            groupState === 'all'
                              ? 'bg-white border-white'
                              : groupState === 'some'
                                ? 'bg-white/40 border-white/70'
                                : 'bg-transparent border-white/50'
                          }`}
                        >
                          {groupState !== 'none' && (
                            <CheckIcon
                              className={`w-3.5 h-3.5 ${
                                groupState === 'all' ? 'text-violet-700' : 'text-white'
                              }`}
                            />
                          )}
                        </button>
                      )}

                      {/* Subject initial avatar */}
                      <div className="w-11 h-11 bg-white/20 border border-white/30 rounded-2xl flex items-center justify-center shrink-0">
                        <span className="text-white font-black text-xl">
                          {subject.charAt(0).toUpperCase()}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-black text-[15px] leading-tight truncate">
                          {subject}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-white/70 text-xs font-semibold">
                            {subAssignments.length} assignment{subAssignments.length !== 1 ? 's' : ''}
                          </span>
                          {subTasks.length > 0 && (
                            <>
                              <span className="text-white/30">·</span>
                              <span className="text-white/70 text-xs">
                                {completedTasks}/{subTasks.length} tasks
                              </span>
                            </>
                          )}
                          {overdueCount > 0 && (
                            <span className="bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full tracking-wide">
                              {overdueCount} OVERDUE
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expand / collapse button */}
                      <button
                        onClick={() => toggleSubject(subject)}
                        className="w-9 h-9 bg-white/15 hover:bg-white/25 border border-white/20 rounded-2xl flex items-center justify-center shrink-0 transition-colors"
                      >
                        <ChevronRightIcon
                          className={`w-4 h-4 text-white transition-transform duration-200 ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                    </div>

                    {/* Progress bar inside header */}
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-white/60 text-[9px] font-black tracking-widest">
                          PROGRESS
                        </span>
                        <span className="text-white font-black text-sm">{overallPct}%</span>
                      </div>
                      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            overallPct === 100 ? 'bg-emerald-300' : 'bg-white/75'
                          }`}
                          style={{ width: `${overallPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Expanded assignment rows ──────────────── */}
                  {isExpanded && (
                    <div className="bg-white dark:bg-[#111128]">
                      {subAssignments.map((a, i) => (
                        <SubjectAssignmentRow
                          key={a.id}
                          assignment={a}
                          isFirst={i === 0}
                          accentGradient={cfg.gradient}
                          selectMode={selectMode}
                          isSelected={selectedIds.has(a.id)}
                          onToggleSelect={() => toggleSelect(a.id)}
                          onOpen={() => navigate(`/assignments/${a.id}`)}
                          onDelete={() => setDeleteTarget(a)}
                        />
                      ))}

                      {!selectMode && (
                        <button
                          onClick={() => navigate('/assignments/new')}
                          className="w-full flex items-center gap-3 px-4 py-3 border-t border-gray-50 dark:border-white/5 hover:bg-violet-50/50 dark:hover:bg-white/5 transition-colors"
                        >
                          <div className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                            <PlusIcon className="w-2.5 h-2.5 text-gray-400" />
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-semibold">
                            Add assignment to {subject}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ──────────────────────────────────────────────────────────
             FLAT LIST VIEW
             ────────────────────────────────────────────────────────── */
          <div className="space-y-3">
            {filtered.map((a) => (
              <SwipeableAssignmentCard
                key={a.id}
                assignment={a}
                selectMode={selectMode}
                isSelected={selectedIds.has(a.id)}
                onToggleSelect={() => toggleSelect(a.id)}
                onOpen={() => navigate(`/assignments/${a.id}`)}
                onDelete={() => setDeleteTarget(a)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Bulk-select action bar — constrained to max-w-md ─────── */}
      {selectMode && (
        <div
          className="fixed z-30 left-0 right-0 flex justify-center"
          style={{ bottom: 82 }}
        >
          <div className="w-full max-w-md px-4">
            <div className="bg-white dark:bg-[#1a1a2e] rounded-3xl shadow-2xl shadow-black/20 dark:shadow-black/60 border border-gray-100 dark:border-violet-900/25 p-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900 dark:text-white">
                  {selectedCount === 0
                    ? 'Tap assignments to select'
                    : `${selectedCount} assignment${selectedCount !== 1 ? 's' : ''} selected`}
                </p>
                {selectedCount > 0 && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mt-0.5">
                    Tasks inside will also be deleted
                  </p>
                )}
              </div>
              <button
                onClick={() => selectedCount > 0 && setBulkDeletePending(true)}
                disabled={selectedCount === 0}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black transition-all ${
                  selectedCount > 0
                    ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-lg shadow-red-400/30 active:scale-95'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                <TrashIcon className="w-4 h-4" />
                Delete{selectedCount > 0 ? ` ${selectedCount}` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Single-delete confirm ─────────────────────────────────── */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete assignment?"
        message={`"${deleteTarget?.title}" and all its tasks will be permanently deleted.`}
        onConfirm={handleSingleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Bulk-delete confirm ───────────────────────────────────── */}
      <ConfirmDialog
        isOpen={bulkDeletePending}
        title={`Delete ${selectedCount} assignment${selectedCount !== 1 ? 's' : ''}?`}
        message={`Permanently deletes ${selectedCount} assignment${selectedCount !== 1 ? 's' : ''} and all their tasks. This cannot be undone.`}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeletePending(false)}
      />
    </div>
  );
}

/* ── Row inside an expanded subject group ────────────────────────── */

function SubjectAssignmentRow({
  assignment: a,
  isFirst,
  accentGradient,
  selectMode,
  isSelected,
  onToggleSelect,
  onOpen,
  onDelete,
}: {
  assignment: Assignment;
  isFirst: boolean;
  accentGradient: string;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect(): void;
  onOpen(): void;
  onDelete(): void;
}) {
  const swipe = useSwipe({ onSwipeLeft: selectMode ? undefined : onDelete });

  return (
    <div
      className={`relative group flex items-stretch ${!isFirst ? 'border-t border-gray-50 dark:border-white/5' : ''}`}
      {...(!selectMode ? swipe : {})}
    >
      {/* Left colour bar */}
      <div className={`w-1 bg-gradient-to-b ${accentGradient} opacity-70 shrink-0`} />

      {/* Main row content */}
      <div
        onClick={selectMode ? onToggleSelect : onOpen}
        className="flex-1 flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-violet-50/50 dark:hover:bg-white/5 transition-colors"
      >
        {selectMode ? (
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              isSelected
                ? 'bg-violet-600 border-violet-600 shadow-md shadow-violet-400/30'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
          </div>
        ) : (
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isOverdue(a)
                ? 'bg-rose-500'
                : a.progress === 100
                  ? 'bg-emerald-500'
                  : 'bg-violet-400'
            }`}
          />
        )}

        <div className="flex-1 min-w-0">
          <p
            className={`font-bold text-sm leading-snug ${
              isSelected
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {a.title}
          </p>
          <p
            className={`text-[11px] font-semibold mt-0.5 ${
              isOverdue(a) ? 'text-rose-500' : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {isOverdue(a) ? `📅 ${formatDueDate(a.dueDate)}` : formatRelativeDue(a.dueDate)}
            &nbsp;·&nbsp;{a.estimatedHours}h est.
          </p>
          {a.progress > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <ProgressBar progress={a.progress} className="flex-1" />
              <span className="text-[10px] font-black text-gray-400 dark:text-gray-500">
                {a.progress}%
              </span>
            </div>
          )}
        </div>

        {!selectMode && (
          <DifficultyBadge difficulty={a.difficulty} />
        )}
      </div>

      {/* Hover trash — desktop, normal mode only */}
      {!selectMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="pr-4 text-gray-300 dark:text-gray-700 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/* ── Flat-list card with swipe-to-delete ─────────────────────────── */

function SwipeableAssignmentCard({
  assignment: a,
  selectMode,
  isSelected,
  onToggleSelect,
  onOpen,
  onDelete,
}: {
  assignment: Assignment;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect(): void;
  onOpen(): void;
  onDelete(): void;
}) {
  const cfg = getSubjectConfig(a.subject);
  const swipe = useSwipe({ onSwipeLeft: selectMode ? undefined : onDelete });

  const accentGrad = isOverdue(a)
    ? 'from-rose-500 to-red-600'
    : a.progress === 100
      ? 'from-emerald-500 to-teal-600'
      : cfg.gradient;

  return (
    <div
      className="relative group"
      {...(!selectMode ? swipe : {})}
      onClick={selectMode ? onToggleSelect : undefined}
    >
      <div
        className={`bg-white dark:bg-[#111128] rounded-3xl overflow-hidden transition-all border ${
          isSelected
            ? 'border-violet-400 dark:border-violet-500 ring-2 ring-violet-300/40 dark:ring-violet-600/30'
            : 'border-violet-50 dark:border-violet-900/20'
        }`}
        style={{ boxShadow: isSelected ? cardShadow(cfg.shadow, 0.35) : cardShadow(cfg.shadow, 0.14) }}
        onClick={selectMode ? undefined : onOpen}
      >
        <div className="flex">
          {/* Left accent bar */}
          <div className={`w-1.5 bg-gradient-to-b ${accentGrad} shrink-0`} />

          <div className="flex-1 px-4 pt-3.5 pb-3.5">
            <div className="flex items-start gap-2 mb-2">
              {/* Checkbox in select mode */}
              {selectMode && (
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                    isSelected
                      ? 'bg-violet-600 border-violet-600'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                </div>
              )}

              <div className="flex-1 min-w-0">
                {/* Subject chip */}
                <span
                  className={`inline-block text-[9px] font-black tracking-wider mb-1.5 px-2 py-0.5 rounded-full ${
                    isOverdue(a)
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                      : 'bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-400'
                  }`}
                >
                  {a.subject}
                </span>
                <p
                  className={`font-black text-sm leading-snug ${
                    isSelected
                      ? 'text-violet-600 dark:text-violet-400'
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {a.title}
                </p>
              </div>

              {!selectMode && (
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <DifficultyBadge difficulty={a.difficulty} />
                </div>
              )}
            </div>

            <p
              className={`text-xs mb-2.5 font-semibold ${
                isOverdue(a) ? 'text-rose-500' : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {isOverdue(a) ? `📅 ${formatDueDate(a.dueDate)}` : formatRelativeDue(a.dueDate)}
              &nbsp;·&nbsp;{a.estimatedHours}h est.
            </p>

            <div className="flex items-center gap-2">
              <ProgressBar progress={a.progress} className="flex-1" />
              <span className="text-xs font-black text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {a.progress}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hover trash — normal mode only */}
      {!selectMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-4 right-3.5 p-2 text-gray-300 dark:text-gray-700 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
