-- =============================================================================
-- Migration: 20260410_perf_indexes
-- Performance indexes for hot-path list queries
-- (Document status+classification, Document soft-delete list, AuditLog filters,
--  Ticket per-user status filters)
-- =============================================================================

-- Document: supports classification-aware list queries
CREATE INDEX IF NOT EXISTS "Document_status_classification_idx"
  ON "Document"("status", "classification");

-- Document: soft-delete + status filter (most common list where clause)
CREATE INDEX IF NOT EXISTS "Document_deletedAt_status_idx"
  ON "Document"("deletedAt", "status");

-- AuditLog: resource + action filters (audit screens, reports)
CREATE INDEX IF NOT EXISTS "AuditLog_resourceType_action_idx"
  ON "AuditLog"("resourceType", "action");

-- Ticket: per-creator status filter (collaborateur tickets list)
CREATE INDEX IF NOT EXISTS "Ticket_creatorId_status_idx"
  ON "Ticket"("creatorId", "status");

-- Ticket: per-assignee status filter (IT agent queue)
CREATE INDEX IF NOT EXISTS "Ticket_assigneeId_status_idx"
  ON "Ticket"("assigneeId", "status");
