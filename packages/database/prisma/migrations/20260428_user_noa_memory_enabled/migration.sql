-- =============================================================================
-- Wave D — Item 31 : Toggle opt-out mémoire Noa par utilisateur
-- =============================================================================
-- Default true : la mémoire Noa est active par défaut (opt-out) car la
-- fonctionnalité a peu de valeur sans persistance entre sessions. Le user
-- peut désactiver depuis /profile : `recall` renvoie [] et `store` devient
-- un no-op. Suppression complète via DELETE /api/v1/noa/memory pour
-- right-to-erasure RGPD (article 17).

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "noaMemoryEnabled" BOOLEAN NOT NULL DEFAULT TRUE;
