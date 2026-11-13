import type { PrismaClient, Prisma, UserRole as PrismaUserRole } from '@prisma/client';
import type { RequestUser } from './interfaces';
import { ROLE_HIERARCHY, UserRole } from './enums';
import { documentReadWhere, hasBaselineDocumentReadAccess, DOCUMENT_PERMISSION_LEVELS, ReadableDocument as PolicyDocument } from './document-library.policy';

export interface DocumentAccessUser { id: string; role: string; departmentId?: string | null; email?: string }
export interface ClassifiedDocument {
  classification: string; ownerId: string; verifierId?: string | null;
  reviewerId?: string | null; approverId?: string | null; status?: string;
  deletedAt?: Date | null;
}
export interface ReadableDocument extends ClassifiedDocument {
  status: string; category?: string | null; isPublic?: boolean | null;
}

/** @deprecated A classification alone cannot authorize document access. Supply its status. */
export function canAccessDocumentByClassification(doc: ClassifiedDocument, user: DocumentAccessUser): boolean {
  return !!doc.status && canReadDocument({ ...doc, status: doc.status }, user);
}

/** Baseline matrix shared by GED, summaries and ISO. Explicit grants use the async resolver. */
export function canReadDocument(doc: ReadableDocument, user: DocumentAccessUser): boolean {
  return hasBaselineDocumentReadAccess(doc, user as RequestUser);
}

function knownReader(user: DocumentAccessUser): boolean {
  return !!user.id && typeof user.role === 'string' && Object.values(UserRole).includes(user.role.toUpperCase() as UserRole);
}

type AccessDatabase = Pick<PrismaClient, 'user' | 'userDepartment' | 'approvalStepInstance' | 'documentPermission'>;

export async function activeDocumentAssignments(db: AccessDatabase, user: DocumentAccessUser, documentId?: string) {
  if (!knownReader(user) || !db.approvalStepInstance) return [];
  const primaryDepartmentId = user.departmentId !== undefined ? user.departmentId : (await db.user.findUnique({ where: { id: user.id }, select: { departmentId: true } }))?.departmentId;
  const rows = await db.approvalStepInstance.findMany({
    where: {
      decision: 'PENDING', instance: { status: 'PENDING', ...(documentId ? { documentId } : {}) },
      OR: [
        { assignedToId: user.id },
        { assignedToId: null, step: { OR: [
          { approverUserId: user.id },
          ...(primaryDepartmentId ? [{ approverUserId: null, approverDeptId: primaryDepartmentId }] : []),
          { approverUserId: null, approverDeptId: null, approverRole: user.role.toUpperCase() as PrismaUserRole },
        ] } },
      ],
    },
    select: { step: { select: { order: true } }, instance: { select: { documentId: true, documentVersionId: true, currentStepOrder: true } } },
  });
  return rows.filter((row) => row.step.order === row.instance.currentStepOrder).map((row) => row.instance);
}

async function readerDepartments(db: AccessDatabase, user: DocumentAccessUser): Promise<string[]> {
  const [account, memberships] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { departmentId: true } }),
    db.userDepartment.findMany({ where: { userId: user.id }, select: { departmentId: true } }),
  ]);
  return [...new Set([account?.departmentId, ...memberships.map((membership) => membership.departmentId)].filter((id): id is string => !!id))];
}

/** SQL scope used before document lists or retrieval; permissions and active version assignments included. */
export async function documentReaderScope(db: AccessDatabase, user: DocumentAccessUser): Promise<Prisma.DocumentWhereInput> {
  if (!knownReader(user)) return { deletedAt: null, id: { in: [] } };
  if (ROLE_HIERARCHY[user.role.toUpperCase() as UserRole] >= ROLE_HIERARCHY[UserRole.DIRECTION]) return { deletedAt: null };
  const [departments, assignments] = await Promise.all([readerDepartments(db, user), activeDocumentAssignments(db, user)]);
  return documentReadWhere(user as RequestUser, departments, new Date(), assignments);
}

/** Object check before loading content or a cached summary. Database errors remain fail closed. */
export async function canReadDocumentWithPermissions(
  db: AccessDatabase, doc: PolicyDocument & { id: string; currentVersionId?: string | null }, user: DocumentAccessUser,
): Promise<boolean> {
  if (!knownReader(user) || doc.deletedAt) return false;
  if (hasBaselineDocumentReadAccess(doc, user as RequestUser)) return true;
  try {
    const departments = await readerDepartments(db, user);
    const permission = await db.documentPermission.findFirst({ where: {
      documentId: doc.id, level: { in: DOCUMENT_PERMISSION_LEVELS },
      OR: [{ userId: user.id }, ...(departments.length ? [{ departmentId: { in: departments } }] : []), { role: user.role.toUpperCase() as PrismaUserRole }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    } });
    if (permission) return true;
    const assignments = await activeDocumentAssignments(db, user, doc.id);
    return assignments.some((assignment) => assignment.documentVersionId === doc.currentVersionId);
  } catch { return false; }
}
