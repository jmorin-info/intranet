-- Ajout du modèle Testimonial — collecte modérée de témoignages authentiques
-- pour le portail public /welcome. Remplace les citations hardcodées fake.

BEGIN;

CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "quote" VARCHAR(280) NOT NULL,
    "department" TEXT,
    "role" TEXT,
    "submittedById" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Testimonial_isApproved_approvedAt_idx" ON "Testimonial"("isApproved", "approvedAt");
CREATE INDEX "Testimonial_submittedById_idx" ON "Testimonial"("submittedById");
CREATE INDEX "Testimonial_submittedAt_idx" ON "Testimonial"("submittedAt");

ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
