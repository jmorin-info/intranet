-- Wiki collaboration: personal pages, sharing, edit lock, version history
-- Safe to replay on existing databases: ADD COLUMN IF NOT EXISTS + CREATE IF NOT EXISTS.

-- AlterTable: WikiPage — sharing & edit lock columns
ALTER TABLE "WikiPage" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "WikiPage" ADD COLUMN IF NOT EXISTS "ownerDepartmentId" TEXT;
ALTER TABLE "WikiPage" ADD COLUMN IF NOT EXISTS "allowedRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WikiPage" ADD COLUMN IF NOT EXISTS "collaborators" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WikiPage" ADD COLUMN IF NOT EXISTS "editLockUserId" TEXT;
ALTER TABLE "WikiPage" ADD COLUMN IF NOT EXISTS "editLockExpiresAt" TIMESTAMP(3);

-- Ensure defaults for arrays on rows already present (Postgres ADD COLUMN keeps DEFAULT for new rows only)
UPDATE "WikiPage" SET "allowedRoles" = ARRAY[]::TEXT[] WHERE "allowedRoles" IS NULL;
UPDATE "WikiPage" SET "collaborators" = ARRAY[]::TEXT[] WHERE "collaborators" IS NULL;

-- CreateIndex: WikiPage visibility & department
CREATE INDEX IF NOT EXISTS "WikiPage_visibility_idx" ON "WikiPage"("visibility");
CREATE INDEX IF NOT EXISTS "WikiPage_ownerDepartmentId_idx" ON "WikiPage"("ownerDepartmentId");

-- CreateTable: WikiPageVersion (snapshots for history / restore)
CREATE TABLE IF NOT EXISTS "WikiPageVersion" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "changeLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiPageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: WikiPageVersion
CREATE INDEX IF NOT EXISTS "WikiPageVersion_pageId_createdAt_idx" ON "WikiPageVersion"("pageId", "createdAt");

-- AddForeignKey: WikiPageVersion -> WikiPage
DO $$ BEGIN
    ALTER TABLE "WikiPageVersion"
      ADD CONSTRAINT "WikiPageVersion_pageId_fkey"
      FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
