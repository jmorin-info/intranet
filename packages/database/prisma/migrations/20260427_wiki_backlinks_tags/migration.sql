-- Migration : Wiki backlinks persistants + tags many-to-many
-- ----------------------------------------------------------------------
-- Wave C — module connaissance enrichi.
--
-- 1. WikiPageBacklink : index persistant des liens [[slug]] entre pages
--    wiki. Alimenté par BacklinkService.rebuildBacklinks() à chaque
--    création/update de WikiPage. Permet l'endpoint
--    GET /wiki/pages/:slug/backlinks sans scanner tout le contenu à chaque
--    appel (le scan in-memory existant reste un fallback).
--
-- 2. WikiTag : tags persistants normalisés (slug + label + couleur),
--    cliquables côté UI pour filtrer la liste wiki.
--
-- 3. WikiPageTag : relation many-to-many WikiPage <-> WikiTag.
--
-- Idempotente : utilise IF NOT EXISTS partout.

-- ----- WikiPageBacklink -----------------------------------------------

CREATE TABLE IF NOT EXISTS "WikiPageBacklink" (
  "id"              TEXT          NOT NULL,
  "fromPageId"      TEXT          NOT NULL,
  "toPageSlug"      TEXT          NOT NULL,
  "occurrenceCount" INTEGER       NOT NULL DEFAULT 1,
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WikiPageBacklink_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WikiPageBacklink_fromPageId_toPageSlug_key'
  ) THEN
    ALTER TABLE "WikiPageBacklink"
      ADD CONSTRAINT "WikiPageBacklink_fromPageId_toPageSlug_key"
      UNIQUE ("fromPageId", "toPageSlug");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WikiPageBacklink_toPageSlug_idx"
  ON "WikiPageBacklink" ("toPageSlug");

CREATE INDEX IF NOT EXISTS "WikiPageBacklink_fromPageId_idx"
  ON "WikiPageBacklink" ("fromPageId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WikiPageBacklink_fromPageId_fkey'
  ) THEN
    ALTER TABLE "WikiPageBacklink"
      ADD CONSTRAINT "WikiPageBacklink_fromPageId_fkey"
      FOREIGN KEY ("fromPageId") REFERENCES "WikiPage"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ----- WikiTag --------------------------------------------------------

CREATE TABLE IF NOT EXISTS "WikiTag" (
  "id"        TEXT          NOT NULL,
  "slug"      TEXT          NOT NULL,
  "name"      TEXT          NOT NULL,
  "colorHex"  TEXT,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WikiTag_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WikiTag_slug_key'
  ) THEN
    ALTER TABLE "WikiTag"
      ADD CONSTRAINT "WikiTag_slug_key" UNIQUE ("slug");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WikiTag_slug_idx"
  ON "WikiTag" ("slug");

-- ----- WikiPageTag ----------------------------------------------------

CREATE TABLE IF NOT EXISTS "WikiPageTag" (
  "pageId"    TEXT          NOT NULL,
  "tagId"     TEXT          NOT NULL,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WikiPageTag_pkey" PRIMARY KEY ("pageId", "tagId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WikiPageTag_pageId_tagId_key'
  ) THEN
    ALTER TABLE "WikiPageTag"
      ADD CONSTRAINT "WikiPageTag_pageId_tagId_key"
      UNIQUE ("pageId", "tagId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WikiPageTag_tagId_idx"
  ON "WikiPageTag" ("tagId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WikiPageTag_pageId_fkey'
  ) THEN
    ALTER TABLE "WikiPageTag"
      ADD CONSTRAINT "WikiPageTag_pageId_fkey"
      FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WikiPageTag_tagId_fkey'
  ) THEN
    ALTER TABLE "WikiPageTag"
      ADD CONSTRAINT "WikiPageTag_tagId_fkey"
      FOREIGN KEY ("tagId") REFERENCES "WikiTag"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
