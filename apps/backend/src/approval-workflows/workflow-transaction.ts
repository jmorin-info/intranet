import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

const retryableSqlStates = new Set(['40P01', '40001']);
const maximumRetries = 3;

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; meta?: unknown };
  if (candidate.code === 'P2034') return true;
  if (typeof candidate.code === 'string' && /^P\d{4}$/.test(candidate.code) && candidate.meta && typeof candidate.meta === 'object') {
    const metadata = candidate.meta as Record<string, unknown>;
    if (['code', 'sqlstate', 'sqlState'].some(key => typeof metadata[key] === 'string' && retryableSqlStates.has(metadata[key] as string))) return true;
  }
  // Prisma 5 can expose PostgreSQL deadlocks as Unknown rather than P2034.
  // Require its actual connector/PostgresError structure, never arbitrary SQL text.
  return error instanceof Prisma.PrismaClientUnknownRequestError
    && /ConnectorError\(ConnectorError\s*\{/.test(error.message)
    && /QueryError\(PostgresError\s*\{\s*code:\s*"(?:40P01|40001)"\s*,\s*message:/.test(error.message);
}

/** Retry the entire serializable operation, including its audit and notifications. */
export async function workflowTransaction<T>(prisma: PrismaService, operation: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isRetryableTransactionError(error)) throw error;
      if (attempt >= maximumRetries) throw new ConflictException('Une action concurrente a modifié ces données. Rechargez la page avant de réessayer.');
      await new Promise<void>(resolve => setTimeout(resolve, 10 * 2 ** attempt));
    }
  }
}
