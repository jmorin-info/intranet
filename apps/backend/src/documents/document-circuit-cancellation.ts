import type { Prisma } from '@prisma/client';

/** Runs in the same transaction that changes the document state or version. */
export async function cancelPendingDocumentCircuits(
  db: Prisma.TransactionClient, documentIds: string[], actorId: string, reason: string,
): Promise<number> {
  const ids = [...new Set(documentIds)];
  if (!ids.length) return 0;
  const instances = await db.approvalInstance.findMany({ where: { documentId: { in: ids }, status: 'PENDING' }, select: { id: true } });
  if (instances.length) {
    const instanceIds = instances.map((instance) => instance.id);
    await db.approvalInstance.updateMany({ where: { id: { in: instanceIds }, status: 'PENDING' }, data: { status: 'CANCELLED', completedAt: new Date() } });
    await db.approvalStepInstance.updateMany({ where: { instanceId: { in: instanceIds }, decision: 'PENDING' }, data: { decision: 'SKIPPED', decidedAt: new Date(), comment: reason } });
    await db.approvalAuditLog.createMany({ data: instanceIds.map((id) => ({ action: 'APPROVAL_CANCELLED', approvalInstanceId: id, actorId, metadata: { reason, documentIds: ids } })) });
  }
  await db.validationRequest.updateMany({ where: { documentId: { in: ids }, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  return instances.length;
}
