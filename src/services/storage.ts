import type { Assignment, Task, AppSettings } from '../types';

const KEYS = {
  assignments: 'am_assignments',
  tasks:       'am_tasks',
  settings:    'am_settings',
};

const DEFAULT_SETTINGS: AppSettings = {
  notificationsEnabled: false,
  theme: 'light',
  timerWork: 25,
  timerBreak: 5,
  timerSound: true,
};

function get<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function set<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  /* ── Assignments ─────────────────────────────────── */
  getAssignments(): Assignment[] {
    return get<Assignment[]>(KEYS.assignments, []);
  },
  saveAssignment(a: Assignment): void {
    const all = storage.getAssignments();
    const idx = all.findIndex((x) => x.id === a.id);
    if (idx >= 0) all[idx] = a;
    else all.push(a);
    set(KEYS.assignments, all);
  },
  deleteAssignment(id: string): void {
    set(KEYS.assignments, storage.getAssignments().filter((a) => a.id !== id));
    set(KEYS.tasks,       storage.getTasks().filter((t) => t.assignmentId !== id));
  },

  /* ── Tasks ───────────────────────────────────────── */
  getTasks(): Task[] {
    return get<Task[]>(KEYS.tasks, []);
  },
  getTasksForAssignment(assignmentId: string): Task[] {
    return storage.getTasks().filter((t) => t.assignmentId === assignmentId);
  },
  saveTasks(tasks: Task[]): void {
    const all = storage.getTasks();
    for (const t of tasks) {
      const idx = all.findIndex((x) => x.id === t.id);
      if (idx >= 0) all[idx] = t;
      else all.push(t);
    }
    set(KEYS.tasks, all);
  },
  saveAllTasks(tasks: Task[]): void {
    set(KEYS.tasks, tasks);
  },
  toggleTask(taskId: string): void {
    const all = storage.getTasks();
    const idx = all.findIndex((t) => t.id === taskId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], completed: !all[idx].completed };
      set(KEYS.tasks, all);
    }
  },
  deleteTasksForAssignment(assignmentId: string): void {
    set(KEYS.tasks, storage.getTasks().filter((t) => t.assignmentId !== assignmentId));
  },

  /* ── Settings ────────────────────────────────────── */
  getSettings(): AppSettings {
    const saved = get<Partial<AppSettings>>(KEYS.settings, {});
    return { ...DEFAULT_SETTINGS, ...saved };
  },
  saveSettings(s: AppSettings): void {
    set(KEYS.settings, s);
  },

  /* ── Data management ─────────────────────────────── */
  clearAll(): void {
    localStorage.removeItem(KEYS.assignments);
    localStorage.removeItem(KEYS.tasks);
  },

  /** Export all app data as a JSON string (for backup download) */
  exportAll(): string {
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      assignments: storage.getAssignments(),
      tasks:       storage.getTasks(),
      settings:    storage.getSettings(),
    }, null, 2);
  },

  /** Restore app data from a JSON backup string */
  importAll(json: string): void {
    const data = JSON.parse(json) as {
      assignments?: Assignment[];
      tasks?: Task[];
      settings?: Partial<AppSettings>;
    };
    if (data.assignments) set(KEYS.assignments, data.assignments);
    if (data.tasks)       set(KEYS.tasks,       data.tasks);
    if (data.settings)    set(KEYS.settings,    { ...DEFAULT_SETTINGS, ...data.settings });
  },
};
