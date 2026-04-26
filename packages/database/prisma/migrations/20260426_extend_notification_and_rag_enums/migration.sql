-- Migration : extension des enums NotificationType et RagSourceType
-- ----------------------------------------------------------------------
-- Contexte : trois services backend insèrent en BDD des valeurs d'enum
-- absentes du schéma Prisma, ce qui fait échouer silencieusement les
-- INSERT côté Postgres. Cette migration ajoute les valeurs manquantes :
--   - NotificationType : MENTION, SIGNATURE_REQUEST, SIGNATURE_REMINDER
--   - RagSourceType    : TICKET
--
-- Idempotente (`ADD VALUE IF NOT EXISTS`, Postgres ≥ 9.6). Aucune
-- valeur d'enum existante n'est supprimée — pas de breaking change.
--
-- Note Postgres : `ALTER TYPE ... ADD VALUE` est autorisé hors transaction
-- et ne peut pas être réutilisé dans la même transaction. Comme cette
-- migration ne référence aucune des nouvelles valeurs, elle peut tourner
-- dans la transaction Prisma sans incident (pattern déjà utilisé dans
-- 20260418_notification_types).

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MENTION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SIGNATURE_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SIGNATURE_REMINDER';

ALTER TYPE "RagSourceType" ADD VALUE IF NOT EXISTS 'TICKET';
