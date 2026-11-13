export interface PendingApproval {
  id: string;
  decision: string;
  dueAt?: string | null;
  isOverdue?: boolean;
  assignedToId?: string | null;
  step: { id: string; name: string; order: number; mode?: string };
  instance: {
    id: string;
    documentId: string;
    status: string;
    currentStepOrder: number;
    startedById?: string;
    workflow: { id: string; name: string };
    document?: { id: string; title: string; reference?: string | null; status?: string } | null;
  };
}

export type ApprovalFilter = 'all' | 'overdue' | 'soon' | 'without-deadline';

export function approvalDueTime(approval: PendingApproval): number | null {
  if (!approval.dueAt) return null;
  const value = Date.parse(approval.dueAt);
  return Number.isFinite(value) ? value : null;
}

export function currentApprovals(approvals: readonly PendingApproval[]): PendingApproval[] {
  return approvals.filter((approval) => approval.decision === 'PENDING'
    && approval.instance.status === 'PENDING'
    && approval.step.order === approval.instance.currentStepOrder);
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}

export function filterApprovals(approvals: readonly PendingApproval[], query: string,
                                filter: ApprovalFilter, now: number): PendingApproval[] {
  const needle = normalized(query.trim());
  return currentApprovals(approvals).filter((approval) => {
    const due = approvalDueTime(approval);
    if (filter === 'overdue' && (due === null || due > now)) return false;
    if (filter === 'soon' && (due === null || due <= now || due > now + 86_400_000)) return false;
    if (filter === 'without-deadline' && due !== null) return false;
    const haystack = normalized([approval.step.name, approval.instance.workflow.name,
      approval.instance.document?.title, approval.instance.document?.reference].filter(Boolean).join(' '));
    return !needle || haystack.includes(needle);
  }).sort((left, right) => {
    const leftDue = approvalDueTime(left) ?? Number.POSITIVE_INFINITY;
    const rightDue = approvalDueTime(right) ?? Number.POSITIVE_INFINITY;
    return leftDue - rightDue || left.instance.workflow.name.localeCompare(right.instance.workflow.name, 'fr');
  });
}

export function approvalSummary(approvals: readonly PendingApproval[], now: number) {
  const current = currentApprovals(approvals);
  return {
    pending: current.length,
    overdue: current.filter((approval) => {
      const due = approvalDueTime(approval);
      return due !== null && due <= now;
    }).length,
    soon: current.filter((approval) => {
      const due = approvalDueTime(approval);
      return due !== null && due > now && due <= now + 86_400_000;
    }).length,
  };
}

export function decisionCommentError(decision: 'APPROVED' | 'REJECTED', comment: string): string | null {
  if (decision === 'REJECTED' && !comment.trim()) return 'Indiquez le motif du refus pour que le demandeur puisse corriger le document.';
  if (comment.trim().length > 2000) return 'Le commentaire ne peut pas dépasser 2 000 caractères.';
  return null;
}

export function approvalRequestError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const response = (error as { response?: { status?: number; data?: { message?: unknown } } }).response;
  if (response?.status === 409) return 'Cette demande a évolué ou a déjà été traitée. La liste va être actualisée.';
  const message = response?.data?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}
