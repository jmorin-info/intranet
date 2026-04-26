-- Migration: Ajout du champ `platform` sur PushSubscription
-- ----------------------------------------------------------------------------
-- Trace la plateforme cliente (`ios`, `macos`, `android`, `desktop`, `unknown`)
-- afin de pouvoir distinguer les souscriptions Safari iOS / macOS des Web Push
-- standard (Chrome / Firefox / Edge). Utile pour :
--   * diagnostiquer les échecs d'envoi par plateforme,
--   * adapter les payloads aux limites Apple Web Push (taille, action buttons),
--   * filtrer les broadcasts si une fonctionnalité est dégradée sur une plateforme.
--
-- Migration purement additive — colonne nullable, pas de back-fill : les
-- souscriptions existantes resteront `NULL` jusqu'à la prochaine resync
-- côté navigateur (le hook `usePushNotifications` réenregistre automatiquement).

ALTER TABLE "PushSubscription"
  ADD COLUMN IF NOT EXISTS "platform" TEXT;

CREATE INDEX IF NOT EXISTS "PushSubscription_platform_idx"
  ON "PushSubscription" ("platform");
