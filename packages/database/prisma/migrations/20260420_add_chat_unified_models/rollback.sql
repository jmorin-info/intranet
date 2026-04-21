-- Rollback for 20260420_add_chat_unified_models
--
-- Usage :
--   export PGPASSWORD="<POSTGRES_PASSWORD>"
--   psql -U omnitech -h localhost -d omnitech_intranet -f rollback.sql
--
-- Puis marquer la migration comme rolled-back cote Prisma :
--   cd packages/database
--   pnpm prisma migrate resolve --rolled-back 20260420_add_chat_unified_models

BEGIN;

DROP TABLE IF EXISTS "ChatMessageFeedback" CASCADE;
DROP TABLE IF EXISTS "ChatMessage" CASCADE;
DROP TABLE IF EXISTS "ChatSession" CASCADE;

DROP TYPE IF EXISTS "ChatFeedbackReason";
DROP TYPE IF EXISTS "ChatFeedbackRating";
DROP TYPE IF EXISTS "ChatMessageRole";
DROP TYPE IF EXISTS "ChatSurface";

COMMIT;

-- Verification post-rollback (sortie attendue : 0 tables, 0 types)
-- SELECT COUNT(*) FROM information_schema.tables
--   WHERE table_schema='public' AND table_name LIKE 'Chat%';
-- SELECT COUNT(*) FROM pg_type WHERE typname LIKE 'Chat%';
