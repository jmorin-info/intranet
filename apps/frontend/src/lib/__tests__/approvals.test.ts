import { describe, expect, it } from 'vitest';
import { approvalSummary, currentApprovals, decisionCommentError, filterApprovals, type PendingApproval } from '../approvals';

const now = Date.parse('2026-11-12T12:00:00Z');
function row(id: string, dueAt: string | null, order = 1): PendingApproval {
  return { id, decision: 'PENDING', dueAt, step: { id: 'step-' + id, name: 'Vérification direction', order },
    instance: { id: 'instance-' + id, documentId: 'doc-' + id, status: 'PENDING', currentStepOrder: 1,
      workflow: { id: 'workflow', name: 'Révision annuelle' }, document: { id: 'doc-' + id, title: 'Politique sécurité', reference: 'POL-01' } } };
}

describe('approval inbox', () => {
  it('never presents future, completed or cancelled steps as actionable', () => {
    const current = row('current', null);
    const future = row('future', null, 2);
    const completed = { ...row('done', null), decision: 'APPROVED' };
    const cancelled = row('cancelled', null); cancelled.instance.status = 'CANCELLED';
    expect(currentApprovals([current, future, completed, cancelled])).toEqual([current]);
  });

  it('sorts overdue and dated items before undated items without mutating the response', () => {
    const rows = [row('undated', null), row('later', '2026-11-13T12:00:00Z'), row('overdue', '2026-11-11T12:00:00Z')];
    expect(filterApprovals(rows, '', 'all', now).map((item) => item.id)).toEqual(['overdue', 'later', 'undated']);
    expect(rows[0]!.id).toBe('undated');
  });

  it('searches title, reference, circuit and step while ignoring French accents', () => {
    for (const query of ['securite', 'pol-01', 'revision', 'verification']) {
      expect(filterApprovals([row('one', null)], query, 'all', now)).toHaveLength(1);
    }
    expect(filterApprovals([row('one', null)], 'introuvable', 'all', now)).toHaveLength(0);
  });

  it('keeps overdue and the next 24 hours as distinct filters', () => {
    const rows = [row('overdue', '2026-11-12T12:00:00Z'), row('soon', '2026-11-13T11:00:00Z'),
      row('later', '2026-11-13T13:00:00Z'), row('undated', null), row('invalid', 'invalid')];
    expect(filterApprovals(rows, '', 'overdue', now).map((item) => item.id)).toEqual(['overdue']);
    expect(filterApprovals(rows, '', 'soon', now).map((item) => item.id)).toEqual(['soon']);
    expect(filterApprovals(rows, '', 'without-deadline', now)).toHaveLength(2);
    expect(approvalSummary(rows, now)).toEqual({ pending: 5, overdue: 1, soon: 1 });
  });

  it('requires a useful rejection reason and enforces the backend comment limit', () => {
    expect(decisionCommentError('REJECTED', ' \n ')).toBeTruthy();
    expect(decisionCommentError('REJECTED', 'Référence de version à corriger')).toBeNull();
    expect(decisionCommentError('APPROVED', '')).toBeNull();
    expect(decisionCommentError('APPROVED', 'x'.repeat(2001))).toBeTruthy();
  });
});
