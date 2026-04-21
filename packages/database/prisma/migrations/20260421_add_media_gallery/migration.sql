-- Médiathèque : albums + items + téléchargements (Phase 1 MVP)

BEGIN;

-- Nouveaux enums
CREATE TYPE "MediaVisibility" AS ENUM ('INTERNAL', 'DEPARTMENT', 'PRIVATE');
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- Flag user : peut gérer les médias (upload, créer albums, éditer)
ALTER TABLE "User" ADD COLUMN "canManageMedia" BOOLEAN NOT NULL DEFAULT false;

-- Album
CREATE TABLE "MediaAlbum" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverItemId" TEXT,
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'INTERNAL',
    "departmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MediaAlbum_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaAlbum_slug_key" ON "MediaAlbum"("slug");
CREATE INDEX "MediaAlbum_visibility_createdAt_idx" ON "MediaAlbum"("visibility", "createdAt");
CREATE INDEX "MediaAlbum_createdById_idx" ON "MediaAlbum"("createdById");
CREATE INDEX "MediaAlbum_slug_idx" ON "MediaAlbum"("slug");

-- Item
CREATE TABLE "MediaItem" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "posterUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "fileSizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MediaItem_albumId_createdAt_idx" ON "MediaItem"("albumId", "createdAt");
CREATE INDEX "MediaItem_uploadedById_idx" ON "MediaItem"("uploadedById");

-- Download tracking
CREATE TABLE "MediaItemDownload" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaItemDownload_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MediaItemDownload_itemId_idx" ON "MediaItemDownload"("itemId");
CREATE INDEX "MediaItemDownload_userId_downloadedAt_idx" ON "MediaItemDownload"("userId", "downloadedAt");

-- FK
ALTER TABLE "MediaAlbum" ADD CONSTRAINT "MediaAlbum_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaAlbum" ADD CONSTRAINT "MediaAlbum_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaAlbum" ADD CONSTRAINT "MediaAlbum_coverItemId_fkey"
    FOREIGN KEY ("coverItemId") REFERENCES "MediaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MediaItem" ADD CONSTRAINT "MediaItem_albumId_fkey"
    FOREIGN KEY ("albumId") REFERENCES "MediaAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaItem" ADD CONSTRAINT "MediaItem_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MediaItemDownload" ADD CONSTRAINT "MediaItemDownload_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaItemDownload" ADD CONSTRAINT "MediaItemDownload_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
