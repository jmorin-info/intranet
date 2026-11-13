import { BadRequestException } from '@nestjs/common';
import { WorkflowRulesService } from './workflow-rules.service';

describe('approval rules at document submission', () => {
  let service: WorkflowRulesService;
  let db: any;
  let runtime: any;
  let document: any;
  let rule: any;
  let createdSteps: any[];

  beforeEach(() => {
    document = { id: 'document', ownerId: 'owner', category: 'POLICY', classification: 'INTERNE', currentVersionId: 'version', deletedAt: null };
    rule = { id: 'rule', name: 'Contrôle métier', condition: { category: 'POLICY' }, steps: [{ level: 1, approverRole: 'REVIEWER', deadlineHours: 24 }] };
    createdSteps = [];
    db = {
      document: { findUnique: jest.fn(async () => document) },
      user: { findUnique: jest.fn(async () => ({ departmentId: 'department' })) },
      workflowRule: { findMany: jest.fn(async () => [rule]), findUnique: jest.fn(async () => rule) },
      approvalInstance: { findFirst: jest.fn(async () => null) },
      approvalWorkflow: { create: jest.fn(async ({ data }) => ({ ...data, id: 'compiled' })) },
      workflowStep: { create: jest.fn(async ({ data }) => { const row = { ...data, id: `step-${createdSteps.length}` }; createdSteps.push(row); return row; }) },
      workflowRuleAuditLog: { create: jest.fn(async () => ({})) },
    };
    runtime = {
      transact: jest.fn(async operation => operation(db)),
      approvers: jest.fn(async (_db, selector) => selector.approverUserId ? [selector.approverUserId] : selector.approverRole === 'ADMIN' ? ['admin'] : ['reviewer', 'second']),
      startInTransaction: jest.fn(async () => ({ id: 'instance', status: 'PENDING' })),
    };
    service = new WorkflowRulesService(db, runtime);
  });

  it('uses category, classification and the author department in the submission transaction', async () => {
    rule.condition = { category: 'POLICY', classification: 'INTERNE', departmentId: 'department' };
    await service.applyAtSubmission(db, document, 'owner');
    expect(db.workflowRule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true }, orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }] }));
    expect(runtime.transact).not.toHaveBeenCalled();
    expect(runtime.startInTransaction).toHaveBeenCalledWith(db, 'compiled', 'document', 'version', 'owner', [], true, {
      'step-0': { userIds: ['reviewer', 'second'], level: 1, parallelGroupId: null },
    });
    expect(db.workflowRuleAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'RULE_INSTANTIATED' }) }));
  });

  it.each([{ departmentId: 'other' }, { minAmount: 100 }, { unknown: 'POLICY' }, true, []])('does not silently match an unmet or malformed condition %j', async condition => {
    rule.condition = condition;
    expect(await service.applyAtSubmission(db, document, 'owner')).toBeNull();
    expect(db.approvalWorkflow.create).not.toHaveBeenCalled();
  });

  it('chooses the first matching rule and keeps a blank rule as the explicit fallback', async () => {
    db.workflowRule.findMany.mockResolvedValue([{ ...rule, id: 'restricted', condition: { category: 'CONTRACT' } }, { ...rule, id: 'fallback', condition: {} }]);
    expect((await service.evaluate({ category: 'POLICY' })).matchedRuleId).toBe('fallback');
  });

  it('compiles one parallel group per level and snapshots each eligible actor once', async () => {
    rule.steps = [
      { level: 2, approverUserId: 'director' },
      { level: 1, approverRole: 'REVIEWER', parallel: true, parallelGroupId: 'quality', deadlineHours: 72 },
      { level: 1, approverRole: 'ADMIN', parallel: true, parallelGroupId: 'quality', deadlineHours: 24 },
    ];
    await service.instantiateWorkflow(rule, document, 'owner');
    expect(createdSteps).toHaveLength(2);
    expect(createdSteps[0]).toMatchObject({ order: 1, mode: 'PARALLEL_ALL', slaHours: 24, approverRole: null, approverUserId: null });
    expect(runtime.startInTransaction.mock.calls[0][7]).toEqual({
      'step-0': { userIds: ['reviewer', 'second', 'admin'], level: 1, parallelGroupId: 'quality' },
      'step-1': { userIds: ['director'], level: 2, parallelGroupId: null },
    });
    expect(runtime.transact).toHaveBeenCalledTimes(1);
    expect(db.approvalWorkflow.create.mock.calls[0][0].data).toMatchObject({ isActive: false, isDefault: false });
  });

  it('does not merge parallel groups across hierarchy levels', async () => {
    rule.steps = [1, 2].map(level => ({ level, approverRole: 'REVIEWER', parallel: true, parallelGroupId: 'quality' }));
    await service.instantiateWorkflow(rule, document, 'owner');
    expect(createdSteps).toHaveLength(2);
  });

  it('reuses only the existing instance of the same rule and immutable version', async () => {
    const existing = { id: 'existing', documentVersionId: 'version', workflow: { name: '[rule:rule] Contrôle métier' } };
    db.approvalInstance.findFirst.mockResolvedValue(existing);
    expect(await service.instantiateWorkflow(rule, document, 'owner')).toEqual(existing);
    expect(db.approvalWorkflow.create).not.toHaveBeenCalled();
    existing.documentVersionId = 'old-version';
    await expect(service.instantiateWorkflow(rule, document, 'owner')).rejects.toThrow(BadRequestException);
  });

  it.each([[{ level: 0, approverRole: 'REVIEWER' }], [{ level: 1, approverRole: 'ROOT' }], [{ level: 1, approverRole: 'REVIEWER', approverUserId: 'user' }], [{ level: 1, approverRole: 'REVIEWER', deadlineHours: -1 }]])('refuses an unfulfillable rule before creating any definition', async steps => {
    rule.steps = steps;
    await expect(service.instantiateWorkflow(rule, document, 'owner')).rejects.toThrow(BadRequestException);
    expect(db.approvalWorkflow.create).not.toHaveBeenCalled();
  });

  it('requires the saved current version before materializing a rule', async () => {
    document.currentVersionId = null;
    await expect(service.instantiateWorkflow(rule, document, 'owner')).rejects.toThrow(BadRequestException);
    expect(db.approvalWorkflow.create).not.toHaveBeenCalled();
  });
});
