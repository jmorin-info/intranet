-- Workflow GED refonte (ISO 27001 A.5.1)
-- Ajout du statut REVIEW_APPROVED : le reviewer a validé, le rédacteur (owner)
-- doit confirmer avant que le document passe en attente d'approbation finale.

-- Postgres ne permet pas d'ajouter directement une valeur à un enum dans une transaction.
-- On l'ajoute au niveau DDL, idempotent via DO $$.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'DocumentStatus' AND e.enumlabel = 'REVIEW_APPROVED'
  ) THEN
    ALTER TYPE "DocumentStatus" ADD VALUE 'REVIEW_APPROVED' AFTER 'IN_REVIEW';
  END IF;
END $$;
