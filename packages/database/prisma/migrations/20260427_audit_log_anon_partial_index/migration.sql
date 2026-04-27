-- Partial index pour le cron d'anonymisation (4h00 UTC quotidien).
--
-- Le cron fait `WHERE createdAt < cutoff AND anonymizedAt IS NULL` ; un
-- index B-tree composite (anonymizedAt, createdAt) inclut bien les NULL en
-- Postgres mais reste large (toutes les lignes). Un index partiel restreint
-- l'index aux seules lignes "à anonymiser", ce qui :
--   - réduit la taille (~10-30 % du volume après quelques mois)
--   - accélère le scan du cron (pas de filtrage post-index)
--
-- Note: CONCURRENTLY interdit dans une transaction Prisma. À la taille
-- actuelle de AuditLog (volume modéré pour 100 users), le lock CREATE
-- INDEX est négligeable (< 1s). Si la table grossit > 10M lignes, basculer
-- vers un script SQL hors Prisma (bash + psql).
CREATE INDEX IF NOT EXISTS "AuditLog_anon_pending_idx"
  ON "AuditLog" ("createdAt")
  WHERE "anonymizedAt" IS NULL;
