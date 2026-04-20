-- Access Reviews (ISO 27001 A.5.18) — Periodic user access review workflow
-- Creates enums, tables, indexes and foreign keys for access review campaigns and individual reviews.

-- CreateEnum: AccessReviewStatus
DO $$ BEGIN
    CREATE TYPE "AccessReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REVOKED', 'MODIFIED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: AccessReviewCampaignStatus
DO $$ BEGIN
    CREATE TYPE "AccessReviewCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: AccessReviewCampaign
CREATE TABLE IF NOT EXISTS "AccessReviewCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "AccessReviewCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "scopeDepartmentId" TEXT,
    "scopeRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessReviewCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: AccessReviewCampaign
CREATE INDEX IF NOT EXISTS "AccessReviewCampaign_status_idx" ON "AccessReviewCampaign"("status");
CREATE INDEX IF NOT EXISTS "AccessReviewCampaign_dueDate_idx" ON "AccessReviewCampaign"("dueDate");

-- CreateTable: AccessReview
CREATE TABLE IF NOT EXISTS "AccessReview" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "status" "AccessReviewStatus" NOT NULL DEFAULT 'PENDING',
    "decision" TEXT,
    "comments" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: AccessReview
CREATE INDEX IF NOT EXISTS "AccessReview_campaignId_status_idx" ON "AccessReview"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "AccessReview_userId_idx" ON "AccessReview"("userId");
CREATE INDEX IF NOT EXISTS "AccessReview_reviewerId_idx" ON "AccessReview"("reviewerId");

-- AddForeignKey: AccessReview -> AccessReviewCampaign
DO $$ BEGIN
    ALTER TABLE "AccessReview"
      ADD CONSTRAINT "AccessReview_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "AccessReviewCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
