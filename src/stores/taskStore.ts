import { create } from 'zustand';
import type { Task } from '../types';
import { storage } from '../services/storage';
import { useStreakStore } from './streakStore';

interface TaskStore {
  tasks: Task[];
  load(): void;
  getForAssignment(assignmentId: string): Task[];
  addTasks(tasks: Task[]): void;
  toggle(taskId: string): void;
  reorder(taskId: string, direction: 'up' | 'down', assignmentId: string): void;
  removeByAssignment(assignmentId: string): void;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],

  load() {
    set({ tasks: storage.getTasks() });
  },

  getForAssignment(assignmentId) {
    return get()
      .tasks.filter((t) => t.assignmentId === assignmentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  addTasks(newTasks) {
    // Assign order based on existing task count for the assignment
    const existing = get().tasks;
    const withOrder = newTasks.map((t, i) => ({
      ...t,
      order: t.order ?? existing.filter((x) => x.assignmentId === t.assignmentId).length + i,
    }));
    storage.saveTasks(withOrder);
    set((state) => {
      const existingIds = new Set(state.tasks.map((t) => t.id));
      const fresh = withOrder.filter((t) => !existingIds.has(t.id));
      return { tasks: [...state.tasks, ...fresh] };
    });
  },

  toggle(taskId) {
    const task = get().tasks.find((t) => t.id === taskId);
    const wasNotCompleted = task ? !task.completed : false;

    storage.toggleTask(taskId);
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed } : t,
      ),
    }));

    if (wasNotCompleted) {
      useStreakStore.getState().recordActivity();
    }
  },

  reorder(taskId, direction, assignmentId) {
    const all = get().tasks;
    // Get tasks for this assignment sorted by current order
    const group = all
      .filter((t) => t.assignmentId === assignmentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const idx = group.findIndex((t) => t.id === taskId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= group.length) return;

    // Swap orders
    const aOrder = group[idx].order ?? idx;
    const bOrder = group[swapIdx].order ?? swapIdx;
    const updA = { ...group[idx],    order: bOrder };
    const updB = { ...group[swapIdx], order: aOrder };

    const newTasks = all.map((t) => {
      if (t.id === updA.id) return updA;
      if (t.id === updB.id) return updB;
      return t;
    });

    storage.saveAllTasks(newTasks);
    set({ tasks: newTasks });
  },

  removeByAssignment(assignmentId) {
    storage.deleteTasksForAssignment(assignmentId);
    set((state) => ({
      tasks: state.tasks.filter((t) => t.assignmentId !== assignmentId),
    }));
  },
}));
