import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('user list database boundary', () => {
  let service: UsersService;
  let prisma: any;
  beforeEach(() => {
    prisma = { user: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    service = new UsersService(prisma, {} as any, {} as any);
  });
  it.each(['firstName', 'lastName', 'email', 'role', 'isActive', 'lastLoginAt', 'updatedAt', 'jobTitle', 'departmentId', 'createdAt'])('supports the allowlisted %s order with a stable tie-breaker', async field => {
    await service.findAll({ sortBy: field, sortOrder: 'asc' });
    expect(prisma.user.findMany.mock.calls[0][0].orderBy).toEqual([{ [field]: 'asc' }, { id: 'asc' }]);
  });
  it.each(['__proto__', 'constructor', 'passwordHash', 'mfaSecret', { toString: () => 'email' }, ['email'], null])('never writes a remotely chosen property for %o', async field => {
    await service.findAll({ sortBy: field, sortOrder: { injected: 'desc' } } as any);
    const query = prisma.user.findMany.mock.calls[0][0];
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
    expect(Object.getPrototypeOf(query.orderBy[0])).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(query.orderBy[0], '__proto__')).toBe(false);
  });
  it('bounds invalid pagination while preserving the internal10000-row CSV export', async () => {
    await service.findAll({ page: NaN, limit: -1 });
    expect(prisma.user.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 20 });
    await service.findAll({ page: 1, limit: 10000 });
    expect(prisma.user.findMany.mock.calls[1][0].take).toBe(10000);
    await service.findAll({ page: Infinity, limit: 10001 });
    expect(prisma.user.findMany.mock.calls[2][0]).toMatchObject({ skip: 0, take: 10000 });
  });
  it.each([{ role: {} }, { departmentId: ['one', 'two'] }, { search: { contains: 'query' } }, { search: 'x'.repeat(513) }])('rejects structured or oversized filters before Prisma: %o', async filters => {
    await expect(service.findAll({}, filters as any)).rejects.toThrow(BadRequestException);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
