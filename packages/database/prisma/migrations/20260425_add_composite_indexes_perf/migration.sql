-- =============================================================================
-- Migration: 20260425_add_composite_indexes_perf
-- Composite indexes ciblant les queries chaudes identifiées dans :
--   tickets.service.ts, incidents.service.ts, audit.service.ts,
--   documents.service.ts, notifications.service.ts
--
-- Critères :
--   - chaque index couvre une query déjà existante en prod ;
--   - aucun n'est redondant avec un @@index simple ou composite préexistant ;
--   - ordre des colonnes choisi pour matcher les filtres égalité d'abord,
--     puis le critère de tri (createdAt/detectedAt) en dernière position.
--
-- NOTE prod : ces CREATE INDEX sont bloquants (Prisma les wrappe dans une
-- transaction, on ne peut pas utiliser CREATE INDEX CONCURRENTLY ici). Sur
-- les tables potentiellement larges (AuditLog en particulier), envisager
-- de recréer manuellement chaque index avec CREATE INDEX CONCURRENTLY après
-- `prisma migrate deploy` si la fenêtre de lock prolongé est gênante.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ticket
-- -----------------------------------------------------------------------------

-- findAll : filtres status + priority triés par createdAt (liste paginée)
CREATE INDEX IF NOT EXISTS "Ticket_status_priority_createdAt_idx"
  ON "Ticket"("status", "priority", "createdAt");

-- ACL non-admin : where.OR contient { departmentId } combiné au filtre status
CREATE INDEX IF NOT EXISTS "Ticket_departmentId_status_idx"
  ON "Ticket"("departmentId", "status");

-- P1.10 : tickets de l'assigné avec dueDate (synchro calendrier + overdue)
CREATE INDEX IF NOT EXISTS "Ticket_assigneeId_dueDate_idx"
  ON "Ticket"("assigneeId", "dueDate");

-- -----------------------------------------------------------------------------
-- Incident
-- -----------------------------------------------------------------------------

-- findAll : where.deletedAt = null + orderBy detectedAt desc (liste paginée)
CREATE INDEX IF NOT EXISTS "Incident_deletedAt_detectedAt_idx"
  ON "Incident"("deletedAt", "detectedAt");

-- ACL collaborateur : where.OR = { reporterId: user.id } + filtre status
CREATE INDEX IF NOT EXISTS "Incident_reporterId_status_idx"
  ON "Incident"("reporterId", "status");

-- ACL agent : where.OR = { assignedToId: user.id } + filtre status
CREATE INDEX IF NOT EXISTS "Incident_assignedToId_status_idx"
  ON "Incident"("assignedToId", "status");

-- Dashboard : count critical + open récents (severity / status / detectedAt)
CREATE INDEX IF NOT EXISTS "Incident_severity_status_detectedAt_idx"
  ON "Incident"("severity", "status", "detectedAt");

-- -----------------------------------------------------------------------------
-- AuditLog
-- -----------------------------------------------------------------------------

-- getStats : critical events sur fenêtre de dates ordered by createdAt desc
CREATE INDEX IF NOT EXISTS "AuditLog_severity_createdAt_idx"
  ON "AuditLog"("severity", "createdAt");

-- Journal per-user filtré par action (où userId + action LIKE + orderBy createdAt)
CREATE INDEX IF NOT EXISTS "AuditLog_userId_action_createdAt_idx"
  ON "AuditLog"("userId", "action", "createdAt");

-- -----------------------------------------------------------------------------
-- Document
-- -----------------------------------------------------------------------------

-- ACL collaborateur : OR = { ownerId: me } combiné au filtre status
CREATE INDEX IF NOT EXISTS "Document_ownerId_status_idx"
  ON "Document"("ownerId", "status");

-- -----------------------------------------------------------------------------
-- CalendarEvent
-- -----------------------------------------------------------------------------

-- Agenda départemental : events d'un département dans une fenêtre temporelle
CREATE INDEX IF NOT EXISTS "CalendarEvent_departmentId_startDate_idx"
  ON "CalendarEvent"("departmentId", "startDate");
