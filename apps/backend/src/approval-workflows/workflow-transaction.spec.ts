import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { workflowTransaction } from './workflow-transaction';

const known = (code: string, meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError('Database test error', { code, clientVersion: '5.22.0', meta });
const unknown = (code: string) => new Prisma.PrismaClientUnknownRequestError(`Error occurred during query execution: ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "${code}", message: "database transaction error", severity: "ERROR" }), transient: false })`, { clientVersion: '5.22.0' });

describe('serializable workflow transaction retry policy', () => {
  let prisma: any;
  const operation = jest.fn(async () => 'committed');
  beforeEach(() => {
    jest.useFakeTimers();
    operation.mockClear();
    prisma = { $transaction: jest.fn(async callback => callback({})) };
  });
  afterEach(() => jest.useRealTimers());

  it('executes the operation with serializable isolation', async () => {
    expect(await workflowTransaction(prisma, operation)).toBe('committed');
    expect(prisma.$transaction).toHaveBeenCalledWith(operation, { isolationLevel: 'Serializable' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    known('P2034'), known('P2010', { code: '40001' }), known('P2010', { sqlState: '40P01' }),
    known('P2010', { sqlstate: '40001' }), unknown('40P01'), unknown('40001'),
  ])('replays the whole transaction for a structured transient error', async error => {
    prisma.$transaction.mockRejectedValueOnce(error);
    const result = workflowTransaction(prisma, operation);
    await jest.runAllTimersAsync();
    expect(await result).toBe('committed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction.mock.calls.every(([callback]: any[]) => callback === operation)).toBe(true);
  });

  it.each([
    known('P2002'), known('P2010', { code: '23505' }), known('P2010', { sqlstate: '40P01 somewhere in a query' }),
    unknown('23505'), new ForbiddenException('Assignment denied'),
    new Error('ConnectorError(ConnectorError { kind: QueryError(PostgresError { code: "40P01", message: "not a Prisma connector error" }) })'),
    new Prisma.PrismaClientUnknownRequestError('User supplied text mentions 40001 and 40P01', { clientVersion: '5.22.0' }),
  ])('preserves unrelated errors without retrying or changing their type', async error => {
    prisma.$transaction.mockRejectedValue(error);
    await expect(workflowTransaction(prisma, operation)).rejects.toBe(error);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([known('P2034'), unknown('40P01')])('reports an explicit conflict after three bounded retries', async error => {
    prisma.$transaction.mockRejectedValue(error);
    const result = workflowTransaction(prisma, operation);
    const assertion = expect(result).rejects.toBeInstanceOf(ConflictException);
    await jest.runAllTimersAsync();
    await assertion;
    expect(prisma.$transaction).toHaveBeenCalledTimes(4);
    await expect(result).rejects.toMatchObject({ status: 409 });
  });
});
