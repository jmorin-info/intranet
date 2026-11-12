import { DocumentStatus, Prisma, UserRole as PrismaUserRole } from '@prisma/client';
import { RequestUser } from './interfaces';
import { ROLE_HIERARCHY, UserRole } from './enums';

export const DOCUMENT_STATUS_GROUPS = {
  drafts: ['DRAFT'],
  review: ['IN_REVIEW', 'REVIEW_APPROVED', 'PENDING_APPROVAL'],
  published: ['APPROVED'],
  expired: ['OBSOLETE'],
  archived: ['ARCHIVED'],
} satisfies Record<string, DocumentStatus[]>;

export type DocumentStatusGroup = keyof typeof DOCUMENT_STATUS_GROUPS;
export const DOCUMENT_PERMISSION_LEVELS = ['READ', 'COMMENT', 'EDIT', 'ADMIN'];

export interface ReadableDocument {
  ownerId: string;
  classification?: string | null;
  status: string;
  deletedAt?: Date | null;
  verifierId?: string | null;
  reviewerId?: string | null;
  approverId?: string | null;
}

function roleOf(user: RequestUser): UserRole | null {
  if (!user.id) return null;
  const role = user.role?.toUpperCase() as UserRole;
  return Object.values(UserRole).includes(role) ? role : null;
}

function baseline(role: UserRole): { classifications: string[]; publishedOnly: boolean } | null {
  switch (role) {
    case UserRole.PRESTATAIRE:
      return { classifications: ['PUBLIC'], publishedOnly: true };
    case UserRole.COLLABORATEUR:
      return { classifications: ['PUBLIC', 'INTERNE'], publishedOnly: true };
    case UserRole.AUDITEUR:
      return { classifications: ['PUBLIC', 'INTERNE', 'CONFIDENTIEL'], publishedOnly: true };
    case UserRole.REVIEWER:
    case UserRole.MANAGER:
      return { classifications: ['PUBLIC', 'INTERNE', 'CONFIDENTIEL'], publishedOnly: false };
    default:
      return null;
  }
}

/** Shared policy for the library, document details, versions and downloads. */
export function hasBaselineDocumentReadAccess(document: ReadableDocument, user: RequestUser): boolean {
  const role = roleOf(user);
  if (!role || document.deletedAt) return false;
  if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.DIRECTION]) return true;
  if (document.ownerId === user.id) return true;
  if ([document.verifierId, document.reviewerId, document.approverId].includes(user.id)) return true;
  const policy = baseline(role);
  return !!policy && policy.classifications.includes(document.classification ?? 'INTERNE')
    && (!policy.publishedOnly || document.status === 'APPROVED');
}

export function documentReadWhere(
  user: RequestUser,
  departmentIds: string[],
  now = new Date(),
  dynamicAssignments: Array<{ documentId: string; documentVersionId: string }> = [],
): Prisma.DocumentWhereInput {
  const role = roleOf(user);
  if (!role) return { deletedAt: null, id: { in: [] } };
  if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[UserRole.DIRECTION]) return { deletedAt: null };
  const policy = baseline(role);
  const alternatives: Prisma.DocumentWhereInput[] = [
    { ownerId: user.id },
    { verifierId: user.id },
    { reviewerId: user.id },
    { approverId: user.id },
    {
      permissions: { some: {
        level: { in: DOCUMENT_PERMISSION_LEVELS },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: [
            { userId: user.id },
            ...(departmentIds.length ? [{ departmentId: { in: departmentIds } }] : []),
            { role: role as PrismaUserRole },
          ] },
        ],
      } },
    },
    ...dynamicAssignments.map(({ documentId, documentVersionId }) => ({ id: documentId, currentVersionId: documentVersionId })),
  ];
  if (policy) alternatives.push({
    classification: { in: policy.classifications },
    ...(policy.publishedOnly ? { status: 'APPROVED' as const } : {}),
  });
  return { deletedAt: null, OR: alternatives };
}
