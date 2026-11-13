import type { Prisma } from '@prisma/client';

/** Use static property names at the database boundary, never arbitrary input keys. */
export function documentSortOrder(field: unknown, direction: unknown): Prisma.DocumentOrderByWithRelationInput {
  const order = direction === 'asc' ? 'asc' : 'desc';
  switch (field) {
    case 'title': return { title: order };
    case 'createdAt': return { createdAt: order };
    case 'reference': return { reference: order };
    case 'status': return { status: order };
    case 'nextReviewDate': return { nextReviewDate: order };
    default: return { updatedAt: order };
  }
}

export function userSortOrder(field: unknown, direction: unknown): Prisma.UserOrderByWithRelationInput {
  const order = direction === 'asc' ? 'asc' : 'desc';
  switch (field) {
    case 'firstName': return { firstName: order };
    case 'lastName': return { lastName: order };
    case 'email': return { email: order };
    case 'role': return { role: order };
    case 'isActive': return { isActive: order };
    case 'lastLoginAt': return { lastLoginAt: order };
    case 'updatedAt': return { updatedAt: order };
    case 'jobTitle': return { jobTitle: order };
    case 'departmentId': return { departmentId: order };
    default: return { createdAt: order };
  }
}
