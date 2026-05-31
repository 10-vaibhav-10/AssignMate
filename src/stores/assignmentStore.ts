import { create } from 'zustand';
import type { Assignment, Difficulty, Priority } from '../types';
import { storage } from '../services/storage';
import { calculateProgress } from '../utils';

export interface CreateAssignmentInput {
  title: string;
  subject: string;
  details: string;
  dueDate: string;
  difficulty: Difficulty;
  estimatedHours: number;
  priority?: Priority;
  grade?: number;
}

interface AssignmentStore {
  assignments: Assignment[];
  load(): void;
  add(input: CreateAssignmentInput): Assignment;
  update(id: string, partial: Partial<Assignment>): void;
  remove(id: string): void;
  refreshProgress(assignmentId: string, tasks: { completed: boolean }[]): void;
}

export const useAssignmentStore = create<AssignmentStore>((set, get) => ({
  assignments: [],

  load() {
    set({ assignments: storage.getAssignments() });
  },

  add(input) {
    const assignment: Assignment = {
      ...input,
      id: crypto.randomUUID(),
      progress: 0,
      createdAt: new Date().toISOString(),
    };
    storage.saveAssignment(assignment);
    set((state) => ({ assignments: [...state.assignments, assignment] }));
    return assignment;
  },

  update(id, partial) {
    const found = get().assignments.find((a) => a.id === id);
    if (!found) return;
    const updated = { ...found, ...partial };
    storage.saveAssignment(updated);
    set((state) => ({
      assignments: state.assignments.map((a) => (a.id === id ? updated : a)),
    }));
  },

  remove(id) {
    storage.deleteAssignment(id); // cascades to tasks in storage
    set((state) => ({ assignments: state.assignments.filter((a) => a.id !== id) }));
  },

  refreshProgress(assignmentId, tasks) {
    const progress = calculateProgress(tasks as { id: string; assignmentId: string; title: string; completed: boolean }[]);
    get().update(assignmentId, { progress });
  },
}));
