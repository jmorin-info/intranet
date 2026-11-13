import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowRuntimeService } from './workflow-runtime.service';

function step(id: string, order: number, changes: Record<string, unknown> = {}) {
  return { id, workflowId: 'workflow', order, name: `Étape ${order}`, mode: 'SINGLE', type: 'APPROVAL',
    approverRole: 'REVIEWER', approverUserId: null, approverDeptId: null, slaHours: 24,
    minApprovers: 1, nextStepIds: [], condition: null, ...changes };
}

describe('approval runtime business invariants', () => {
  let runtime: WorkflowRuntimeService;
  let db: any;
  let state: any;
  let workflow: any;
  let document: any;
  let users: any[];
  let events: any[];
  let notifications: any[];
  const copy = <T>(value: T): T => structuredClone(value);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-12T10:00:00Z'));
    document = { id: 'document', ownerId: 'owner', title: 'Politique de sécurité', reference: 'POL_001', currentVersionId: 'version', scanStatus: 'CLEAN', category: 'POLICY', classification: 'INTERNE', status: 'IN_REVIEW', deletedAt: null };
    users = [
      { id: 'owner', role: 'COLLABORATEUR', departmentId: null, isActive: true, deletedAt: null },
      { id: 'reviewer', role: 'REVIEWER', departmentId: 'dept', isActive: true, deletedAt: null },
      { id: 'second', role: 'REVIEWER', departmentId: 'dept', isActive: true, deletedAt: null },
      { id: 'admin', role: 'ADMIN', departmentId: null, isActive: true, deletedAt: null },
    ];
    workflow = { id: 'workflow', name: 'Circuit qualité', isActive: true, documentCategory: 'POLICY', steps: [step('first', 1), step('second-step', 2)] };
    state = { id: 'instance', workflowId: 'workflow', documentId: 'document', documentVersionId: 'version', currentStepOrder: 1, status: 'PENDING', startedAt: new Date('2026-11-08T09:00:00Z'), startedById: 'owner', workflow, stepResults: [
      { id: 'row-first', instanceId: 'instance', stepId: 'first', assignedToId: 'reviewer', decision: 'PENDING', dueAt: new Date('2026-11-10T09:00:00Z'), step: workflow.steps[0] },
      { id: 'row-second', instanceId: 'instance', stepId: 'second-step', assignedToId: 'reviewer', decision: 'PENDING', dueAt: null, step: workflow.steps[1] },
    ] };
    events = []; notifications = [];
    const matches = (row: any, where: any) => (!where.id || row.id === where.id || where.id.in?.includes(row.id))
      && (!where.instanceId || row.instanceId === where.instanceId) && (!where.stepId || row.stepId === where.stepId)
      && (!where.decision || row.decision === where.decision)
      && (!where.instance || state.status === where.instance.status && state.currentStepOrder === where.instance.currentStepOrder);
    db = {
      user: {
        findUnique: jest.fn(async ({ where }) => copy(users.find(user => user.id === where.id) ?? null)),
        findMany: jest.fn(async ({ where }) => copy(users.filter(user => user.isActive && !user.deletedAt && user.id !== where.NOT?.id
          && (!where.id || typeof where.id === 'string' ? !where.id || user.id === where.id : where.id.in.includes(user.id))
          && (!where.role || user.role === where.role) && (!where.departmentId || user.departmentId === where.departmentId)))),
      },
      document: { findUnique: jest.fn(async () => copy(document)), findMany: jest.fn(async () => [copy(document)]), updateMany: jest.fn(async ({ data }) => { Object.assign(document, data); return { count: 1 }; }) },
      validationRequest: { updateMany: jest.fn(async () => ({ count: 1 })) },
      approvalDelegation: { findMany: jest.fn(async () => []) },
      documentVersion: { findUnique: jest.fn(async () => ({ documentId: 'document' })) },
      approvalWorkflow: { findUnique: jest.fn(async () => copy(workflow)) },
      approvalInstance: {
        findFirst: jest.fn(async () => null), findMany: jest.fn(async () => [{ id: state.id }]),
        findUnique: jest.fn(async () => copy(state)),
        update: jest.fn(async ({ data }) => { Object.assign(state, data); return copy(state); }),
        create: jest.fn(async ({ data }) => {
          state = { ...state, ...data, id: 'instance', workflow: copy(workflow), startedAt: new Date(),
            stepResults: data.stepResults.create.map((row: any, index: number) => ({ ...row, id: `created-${index}`, instanceId: 'instance', stepId: row.step.connect.id, assignedToId: row.assignedTo?.connect.id ?? null, dueAt: row.dueAt ?? null, step: copy(workflow.steps.find((item: any) => item.id === row.step.connect.id)) })) };
          return copy(state);
        }),
      },
      approvalStepInstance: {
        findUnique: jest.fn(async ({ where }) => { const row = state.stepResults.find((item: any) => item.id === where.id); return row ? copy({ ...row, instance: { ...state, stepResults: undefined } }) : null; }),
        findMany: jest.fn(async () => copy(state.stepResults.map((row: any) => ({ ...row, instance: { ...state, stepResults: undefined } })))),
        updateMany: jest.fn(async ({ where, data }) => {
          let count = 0;
          for (const row of state.stepResults) if (matches(row, where)) { Object.assign(row, data); count++; }
          return { count };
        }),
      },
      approvalAuditLog: {
        create: jest.fn(async ({ data }) => { const row = { ...data, id: `event-${events.length}`, createdAt: new Date() }; events.push(row); return row; }),
        findFirst: jest.fn(async ({ where }) => copy([...events].reverse().find(event => event.action === where.action && event.approvalInstanceId === where.approvalInstanceId
          && (!where.stepInstanceId || event.stepInstanceId === where.stepInstanceId)
          && (!where.metadata || event.metadata[where.metadata.path[0]] === where.metadata.equals)) ?? null)),
      },
      notification: { createMany: jest.fn(async ({ data }) => { notifications.push(...data); return { count: data.length }; }) },
      $transaction: jest.fn(async (operation) => {
        const backup = copy({ state, events, notifications });
        try { return await operation(db); }
        catch (error) { state = backup.state; events = backup.events; notifications = backup.notifications; throw error; }
      }),
    };
    runtime = new WorkflowRuntimeService(db, new WorkflowEngineService(db));
  });

  afterEach(() => jest.useRealTimers());

  it('records the decision and starts only the next stage deadline', async () => {
    const result = await runtime.decide('row-first', 'reviewer', 'APPROVED', 'Conforme');
    expect(result.currentStepOrder).toBe(2);
    expect(result.stepResults[1].dueAt).toEqual(new Date('2026-11-13T10:00:00Z'));
    expect(events.map(event => event.action)).toEqual(['APPROVAL_STEP_APPROVED', 'APPROVAL_STEP_ACTIVATED']);
    expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
  });

  it('repeated transmission of the same decision does not write another audit or change its comment', async () => {
    await runtime.decide('row-first', 'reviewer', 'APPROVED', 'Premier avis');
    const count = events.length;
    await runtime.decide('row-first', 'reviewer', 'APPROVED', 'Nouvelle requête');
    expect(events).toHaveLength(count);
    expect(state.stepResults[0].comment).toBe('Premier avis');
    await expect(runtime.decide('row-first', 'reviewer', 'REJECTED', 'Modification')).rejects.toThrow(ConflictException);
  });

  it('does not accept a decision on a future stage', async () => {
    await expect(runtime.decide('row-second', 'reviewer', 'APPROVED')).rejects.toThrow(ConflictException);
    expect(db.approvalStepInstance.updateMany).not.toHaveBeenCalled();
  });

  it.each(['other', 'inactive', 'owner'] )('rejects an unauthorized %s actor', async kind => {
    const id = kind === 'inactive' ? 'reviewer' : kind === 'owner' ? 'owner' : 'second';
    if (kind === 'inactive') users[1].isActive = false;
    await expect(runtime.decide('row-first', id, 'APPROVED')).rejects.toThrow(ForbiddenException);
  });

  it('rejects decisions against a replaced version or unsafe file', async () => {
    document.currentVersionId = 'new-version';
    await expect(runtime.decide('row-first', 'reviewer', 'APPROVED')).rejects.toThrow(ConflictException);
    document.currentVersionId = 'version'; document.scanStatus = 'INFECTED';
    await expect(runtime.decide('row-first', 'reviewer', 'APPROVED')).rejects.toThrow(ConflictException);
  });

  it('requires a useful correction reason and closes all pending steps after rejection', async () => {
    expect(() => runtime.decide('row-first', 'reviewer', 'REJECTED', '  ')).toThrow(BadRequestException);
    const result = await runtime.decide('row-first', 'reviewer', 'REJECTED', '  Ajouter le périmètre.  ');
    expect(result.status).toBe('REJECTED');
    expect(result.stepResults[0].comment).toBe('Ajouter le périmètre.');
    expect(result.stepResults[1].decision).toBe('SKIPPED');
  });

  it('does not change the result when a concurrent decision consumed the row', async () => {
    db.approvalStepInstance.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(runtime.decide('row-first', 'reviewer', 'APPROVED')).rejects.toThrow(ConflictException);
    expect(events).toHaveLength(0);
  });

  it('waits for all parallel approvers and skips unused votes only after the quorum is reached', async () => {
    workflow.steps[0].mode = 'PARALLEL_ALL'; state.workflow = workflow;
    state.stepResults.push({ ...copy(state.stepResults[0]), id: 'row-peer', assignedToId: 'second', step: workflow.steps[0] });
    state.stepResults[0].step = workflow.steps[0];
    await runtime.decide('row-first', 'reviewer', 'APPROVED');
    expect(state.currentStepOrder).toBe(1);
    await runtime.decide('row-peer', 'second', 'APPROVED');
    expect(state.currentStepOrder).toBe(2);
  });

  it('never publishes a document when the additional circuit completes', async () => {
    workflow.steps = [workflow.steps[0]]; state.workflow = workflow; state.stepResults = [state.stepResults[0]];
    expect((await runtime.decide('row-first', 'reviewer', 'APPROVED')).status).toBe('APPROVED');
    expect(document.status).toBe('IN_REVIEW');
  });

  it('shows only the current stage, with document metadata and overdue status', async () => {
    const pending = await runtime.pending('reviewer');
    expect(pending.map(row => row.id)).toEqual(['row-first']);
    expect(pending[0].instance.document.reference).toBe('POL_001');
    expect(pending[0].isOverdue).toBe(true);
    document.currentVersionId = 'replacement';
    expect(await runtime.pending('reviewer')).toEqual([]);
  });

  it.each(['ARCHIVED', 'OBSOLETE', 'APPROVED'])('does not offer, decide or remind a stale pending circuit on a %s document', async status => {
    document.status = status;
    expect(await runtime.pending('reviewer')).toEqual([]);
    expect(db.document.findMany.mock.calls[0][0].where.status.notIn).toEqual(expect.arrayContaining(['APPROVED', 'ARCHIVED', 'OBSOLETE']));
    await expect(runtime.decide('row-first', 'reviewer', 'APPROVED')).rejects.toThrow(ConflictException);
    await expect(runtime.remind('instance', 'owner')).rejects.toThrow(ConflictException);
    await expect(runtime.remind('instance', null, true)).rejects.toThrow(ConflictException);
    await expect(runtime.evaluate('instance')).rejects.toThrow(ConflictException);
    expect(db.approvalStepInstance.updateMany).not.toHaveBeenCalled();
    expect(notifications).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('keeps a circuit started on a draft actionable before quality submission', async () => {
    document.status = 'DRAFT';
    expect((await runtime.pending('reviewer')).map(row => row.id)).toEqual(['row-first']);
    expect((await runtime.remind('instance', 'owner')).sent).toBe(1);
    expect((await runtime.decide('row-first', 'reviewer', 'APPROVED')).currentStepOrder).toBe(2);
    expect(document.status).toBe('DRAFT');
  });

  it('reminds the assigned actor once a Paris calendar day without sending to future stages', async () => {
    expect(await runtime.remind('instance', 'owner')).toEqual({ sent: 1, alreadySent: false, recipientCount: 1 });
    expect(await runtime.remind('instance', 'owner')).toEqual({ sent: 0, alreadySent: true, recipientCount: 0 });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].userId).toBe('reviewer');
    jest.advanceTimersByTime(24 * 3_600_000);
    expect((await runtime.remind('instance', null, true)).sent).toBe(1);
  });

  it('does not remind a new stage before its deadline and denies unrelated manual reminders', async () => {
    await expect(runtime.remind('instance', 'second')).rejects.toThrow(ForbiddenException);
    state.stepResults[0].dueAt = new Date('2026-11-13T10:00:00Z');
    expect((await runtime.remind('instance', null, true)).sent).toBe(0);
    expect(notifications).toHaveLength(0);
  });

  it('cancels once, closes remaining decisions and cannot cancel an approved instance', async () => {
    expect((await runtime.cancel('instance', 'admin')).status).toBe('CANCELLED');
    expect(state.stepResults.every((row: any) => row.decision === 'SKIPPED')).toBe(true);
    const count = events.length;
    await runtime.cancel('instance', 'admin'); expect(events).toHaveLength(count);
    state.status = 'APPROVED';
    await expect(runtime.cancel('instance', 'admin')).rejects.toThrow(ConflictException);
  });

  it('starts only against a current version owned by the document and keeps later deadlines empty', async () => {
    const result = await runtime.start('workflow', 'document', 'version', 'owner');
    expect(result.currentStepOrder).toBe(1);
    expect(result.stepResults[0].dueAt).toEqual(new Date('2026-11-13T10:00:00Z'));
    expect(result.stepResults[1].dueAt).toBeNull();
    db.documentVersion.findUnique.mockResolvedValue({ documentId: 'other-document' });
    await expect(runtime.start('workflow', 'document', 'version', 'owner')).rejects.toThrow(BadRequestException);
  });

  it('does not let the owner replace a required reviewer with an unqualified user', async () => {
    await expect(runtime.start('workflow', 'document', 'version', 'owner', [{ stepId: 'first', approverUserId: 'owner' }])).rejects.toThrow(BadRequestException);
  });

  it('retries a serialization conflict without losing the decision', async () => {
    db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    const decision = runtime.decide('row-first', 'reviewer', 'APPROVED');
    await jest.runAllTimersAsync();
    await decision;
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(events.filter(event => event.action === 'APPROVAL_STEP_APPROVED')).toHaveLength(1);
  });
  it('executes the chosen visual branch and never activates an unselected approval', async () => {
    workflow.steps = [
      step('start', 1, { type: 'START', nextStepIds: ['branch'] }),
      step('branch', 2, { type: 'BRANCH', nextStepIds: ['policy', 'other'] }),
      step('policy', 3, { nextStepIds: ['end'], condition: { field: 'category', value: 'POLICY' } }),
      step('other', 4, { nextStepIds: ['end'], condition: null, approverRole: 'ADMIN' }),
      step('end', 5, { type: 'END' }),
    ];
    const result = await runtime.start('workflow', 'document', 'version', 'owner');
    expect(result.currentStepOrder).toBe(3);
    expect(result.stepResults.find(row => row.stepId === 'other')?.dueAt).toBeNull();
    expect(notifications.map(item => item.userId).sort()).toEqual(['reviewer', 'second']);
    const row = result.stepResults.find(item => item.stepId === 'policy')!;
    expect((await runtime.decide(row.id, 'reviewer', 'APPROVED')).status).toBe('APPROVED');
    expect(state.stepResults.find((item: any) => item.stepId === 'other').decision).toBe('SKIPPED');
    expect(document.status).toBe('IN_REVIEW');
  });

  it('applies the active scoped delegation at activation and preserves independent quorum votes', async () => {
    workflow.steps[0] = step('first', 1, { approverRole: null, approverUserId: 'reviewer' });
    db.approvalDelegation.findMany.mockResolvedValue([{ id: 'holiday', scope: 'SCOPED', categories: ['POLICY'], toUserId: 'second' }]);
    const result = await runtime.start('workflow', 'document', 'version', 'owner');
    expect(result.stepResults[0].assignedToId).toBe('second');
    expect(events.some(event => event.action === 'APPROVAL_DELEGATION_APPLIED')).toBe(true);
    expect((await runtime.pending('second')).map(row => row.id)).toEqual([result.stepResults[0].id]);
    await expect(runtime.decide(result.stepResults[0].id, 'reviewer', 'APPROVED')).rejects.toThrow(ForbiddenException);
  });

  it('returns the rejected version to an editable draft and closes its quality request', async () => {
    await runtime.decide('row-first', 'reviewer', 'REJECTED', 'Compléter le périmètre');
    expect(document.status).toBe('DRAFT');
    expect(db.validationRequest.updateMany).toHaveBeenCalledWith({ where: { documentId: 'document', documentVersionId: 'version', status: 'PENDING' }, data: { status: 'REJECTED' } });
    expect(notifications[0]).toMatchObject({ userId: 'owner', type: 'DOC_REJECTED' });
    expect(state.stepResults[0].comment).toBe('Compléter le périmètre');
  });

  it('does not starve reminders beyond the first hundred pending instances', async () => {
    db.approvalInstance.findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({ id: `instance-${index}` }))).mockResolvedValueOnce([{ id: 'last' }]);
    const reminder = jest.spyOn(runtime, 'remind').mockResolvedValue({ sent: 0, alreadySent: true, recipientCount: 0 });
    expect(await runtime.remindOverdue()).toEqual({ examined: 101, sent: 0 });
    expect(reminder).toHaveBeenCalledWith('last', null, true);
    expect(db.approvalInstance.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 'instance-99' }, skip: 1 });
  });

});
