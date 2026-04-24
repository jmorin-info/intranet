export interface ApiError {
  message?: string;
  response?: { data?: { message?: string } };
}

export interface ProfileData {
  mfaEnabled: boolean;
  lastLoginAt?: string;
  chartesAcceptedAt?: string;
}

export interface DepartmentInfo {
  id: string;
  name: string;
  code: string;
}

export interface CharteStatus {
  id: string;
  title: string;
  signedAt: string | null;
}

export interface QuizHistoryData {
  bestScore: number;
  bestTotal: number;
  lastDate: string;
  rank: number;
  totalParticipants: number;
}

export interface NotifPrefs {
  emailDocuments: boolean;
  emailTickets: boolean;
  emailSecurityAlerts: boolean;
  emailNews: boolean;
  dailySummary: boolean;
  pushBrowser: boolean;
}

export interface GedSummaryData {
  myDrafts: number;
  myInReview: number;
  toApproveByMe: number;
  toConfirmByMe: number;
  nearReviewDate: number;
  total: number;
}

export interface RecentActivityItem {
  id: string;
  action: string;
  createdAt: string;
  date?: string;
  details?: string | Record<string, unknown>;
}

export const SKILL_COLORS = [
  "bg-primary/10 text-primary border-primary/20",
  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
  "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800",
  "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800",
  "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800",
  "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800",
  "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800",
];
