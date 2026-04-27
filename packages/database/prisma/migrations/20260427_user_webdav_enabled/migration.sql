-- Permission per-user pour l'accès WebDAV (sync Obsidian).
--
-- Default false : l'admin doit explicitement activer la fonctionnalité
-- pour chaque user qui en a besoin (principe de moindre privilège).
-- Le contrôle d'accès est doublé d'un feature flag global AppConfig
-- "webdav.enabled" (cf. WebDAVService).
ALTER TABLE "User"
  ADD COLUMN "webdavEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "User_webdavEnabled_idx" ON "User" ("webdavEnabled")
  WHERE "webdavEnabled" = true;
