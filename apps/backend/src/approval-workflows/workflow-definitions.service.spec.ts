import { BadRequestException } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';

describe('historical workflow definitions', () => {
  let service: WorkflowsService;
  let db: any;
  let workflow: any;
  beforeEach(() => {
    workflow = { id: 'workflow', name: 'Circuit', documentCategory: 'POLICY', steps: [
      { id: 'first', workflowId: 'workflow', order: 1, name: 'Début', type: 'START', mode: 'SINGLE', nextStepIds: ['last'], condition: null },
      { id: 'last', workflowId: 'workflow', order: 2, name: 'Fin', type: 'END', mode: 'SINGLE', nextStepIds: [], condition: null },
    ] };
    db = {
      approvalInstance: { count: jest.fn(async () => 1) },
      approvalWorkflow: { findUnique: jest.fn(async () => workflow), update: jest.fn(async ({ data }) => data), create: jest.fn(async ({ data }) => data) },
      workflowStep: { findUnique: jest.fn(async () => workflow.steps[0]), findMany: jest.fn(async () => workflow.steps), update: jest.fn(), create: jest.fn(), delete: jest.fn() },
    };
    service = new WorkflowsService(db, { transact: (operation: (db: any) => Promise<unknown>) => operation(db) } as any);
  });

  it.each(['add', 'remove', 'reorder', 'rename'] )('does not change a used definition through %s', async change => {
    const operation = change === 'add' ? service.addStep('workflow', { name: 'Nouvelle', approverRole: 'REVIEWER' })
      : change === 'remove' ? service.removeStep('first')
        : change === 'reorder' ? service.reorderSteps('workflow', ['last', 'first'])
          : service.update('workflow', { name: 'Réécrit' });
    await expect(operation).rejects.toThrow(BadRequestException);
    expect(db.workflowStep.update).not.toHaveBeenCalled();
    expect(db.workflowStep.delete).not.toHaveBeenCalled();
    expect(db.approvalWorkflow.update).not.toHaveBeenCalled();
    expect(db.approvalInstance.count).toHaveBeenCalledWith({ where: { workflowId: 'workflow' } });
  });

  it('can deactivate a used definition without rewriting historical metadata', async () => {
    expect(await service.update('workflow', { isActive: false })).toMatchObject({ isActive: false });
    expect(db.approvalInstance.count).not.toHaveBeenCalled();
  });

  it('duplicates all graph identities and edges into an inactive independent copy', async () => {
    const copy = await service.duplicate('workflow', 'admin');
    expect(copy).toMatchObject({ isActive: false, isDefault: false, createdById: 'admin' });
    const nodes = db.approvalWorkflow.create.mock.calls[0][0].data.steps.create;
    expect(nodes[0].id).not.toBe('first'); expect(nodes[1].id).not.toBe('last');
    expect(nodes[0].nextStepIds).toEqual([nodes[1].id]);
    expect(nodes[1].nextStepIds).toEqual([]);
    expect(workflow.steps[0].nextStepIds).toEqual(['last']);
  });

  it.each([['first', 'foreign'], ['first'], ['first', 'first']])('refuses a partial, duplicated or foreign ordering %j', async (...ids) => {
    db.approvalInstance.count.mockResolvedValue(0);
    await expect(service.reorderSteps('workflow', ids)).rejects.toThrow(BadRequestException);
    expect(db.workflowStep.update).not.toHaveBeenCalled();
  });

  it('swaps unused steps without violating the unique order during intermediate writes', async () => {
    db.approvalInstance.count.mockResolvedValue(0);
    const occupied = new Map([['first', 1], ['last', 2]]);
    db.workflowStep.update.mockImplementation(async ({ where, data }: any) => {
      expect([...occupied].some(([id, order]) => id !== where.id && order === data.order)).toBe(false);
      occupied.set(where.id, data.order);
    });
    await service.reorderSteps('workflow', ['last', 'first']);
    expect(occupied).toEqual(new Map([['first', 2], ['last', 1]]));
  });
});
