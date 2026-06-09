export type Difficulty = 'easy' | 'medium' | 'hard';
export type Priority  = 'urgent' | 'normal' | 'low';

export interface Assignment {
  id: string;
  title: string;
  subject: string;
  details: string;
  dueDate: string;         // "YYYY-MM-DD"
  difficulty: Difficulty;
  estimatedHours: number;  // 2 | 5 | 10 | 20
  progress: number;        // 0–100
  createdAt: string;       // ISO string
  aiExplanation?: string;
  aiStudyPlan?: string;    // JSON: StudyPlanDay[]
  studyMinutes?: number;   // total minutes logged via timer
  priority?: Priority;     // urgent | normal | low
  grade?: number;          // 0–100 once graded, undefined = not yet graded
  weight?: string;         // e.g. "25%" — weighting in final grade (from outline import)
}

export interface Task {
  id: string;
  assignmentId: string;
  title: string;
  completed: boolean;
  dueDate?: string;        // "YYYY-MM-DD"
  order?: number;          // for drag/reorder; lower = higher in list
}

export interface AiTask {
  title: string;
  dueDateOffset: number;   // days from today
}

export interface StudyPlanDay {
  date: string;            // "YYYY-MM-DD"
  tasks: string[];
}

export interface AiResponse {
  explanation: string;
  tasks: AiTask[];
  studyPlan: StudyPlanDay[];
}

export type AiStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AppSettings {
  notificationsEnabled: boolean;
  notificationHour: number;   // 0–23, hour of day to fire reminders (default 9)
  notificationMinute: number; // 0 | 15 | 30 | 45, minute of hour (default 0)
  theme: 'light' | 'dark';
  timerWork: number;    // minutes (default 25)
  timerBreak: number;   // minutes (default 5)
  timerSound: boolean;  // play audio beep when session ends
}

/** One assignment extracted from a subject outline PDF */
export interface ExtractedAssignment {
  title: string;
  details: string;
  dueDate: string;
  difficulty: Difficulty;
  estimatedHours: number;
  weight: string;
}

/** Full result of parsing a subject outline */
export interface OutlineParseResult {
  subject: string;
  assignments: ExtractedAssignment[];
}
