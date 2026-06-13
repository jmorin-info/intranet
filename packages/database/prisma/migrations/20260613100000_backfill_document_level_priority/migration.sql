-- Migration : Backfill documentLevel / priority (REG_016)
-- Date : 2026-06-13
-- But  : Renseigner les colonnes "documentLevel" et "priority" ajoutees
--        par la migration 20260613000000_pol015_pro040_reg016_alignment
--        sur les documents existants (pre-alignement POL_015 / PRO_040 / REG_016).
-- Refs :
--   - POL_015 (Politique de gestion documentaire)
--   - PRO_040 §7.1 (Pyramide documentaire) et §7.4 (Nomenclature)
--   - REG_016 (Registre documentaire — colonnes D "Niveau" et H "Priorite")
-- Source du mapping category -> documentLevel :
--   packages/shared/src/enums.ts (constante DOCUMENT_CATEGORY_LEVEL).
-- Idempotent : toutes les UPDATE filtrent sur "IS NULL" — safe a rejouer.

-- 1) Backfill documentLevel selon la categorie (pyramide PRO_040 §7.1).
UPDATE "Document"
SET "documentLevel" = CASE category
  WHEN 'POLICY'        THEN 'GOVERNANCE'::"DocumentLevel"
  WHEN 'PLAN'          THEN 'GOVERNANCE'::"DocumentLevel"
  WHEN 'ORGANIZATION'  THEN 'GOVERNANCE'::"DocumentLevel"
  WHEN 'PROCEDURE'     THEN 'OPERATIONAL'::"DocumentLevel"
  WHEN 'INSTRUCTION'   THEN 'OPERATIONAL'::"DocumentLevel"
  WHEN 'STANDARD'      THEN 'OPERATIONAL'::"DocumentLevel"
  WHEN 'GUIDE'         THEN 'OPERATIONAL'::"DocumentLevel"
  WHEN 'REGISTRY'      THEN 'EVIDENCE'::"DocumentLevel"
  WHEN 'FORM'          THEN 'EVIDENCE'::"DocumentLevel"
  WHEN 'RECORD'        THEN 'EVIDENCE'::"DocumentLevel"
  WHEN 'REPORT'        THEN 'EVIDENCE'::"DocumentLevel"
  WHEN 'CHARTER'       THEN 'COMMUNICATION'::"DocumentLevel"
  WHEN 'COMMUNICATION' THEN 'COMMUNICATION'::"DocumentLevel"
  WHEN 'CONTRACT'      THEN 'EVIDENCE'::"DocumentLevel"
  WHEN 'OTHER'         THEN 'EVIDENCE'::"DocumentLevel"
  ELSE 'EVIDENCE'::"DocumentLevel"
END
WHERE "documentLevel" IS NULL;

-- 2) Backfill priority HIGH pour les documents bloquants ou gouvernance + POLICY.
--    Doit etre exectue AVANT le defaut MEDIUM (sinon l'OR ne s'applique plus).
UPDATE "Document"
SET "priority" = 'HIGH'::"DocumentPriority"
WHERE "priority" IS NULL
  AND (
    "blocking" = true
    OR (category = 'POLICY' AND "documentLevel" = 'GOVERNANCE'::"DocumentLevel")
  );

-- 3) Defaut MEDIUM pour tous les documents restant sans priorite.
UPDATE "Document"
SET "priority" = 'MEDIUM'::"DocumentPriority"
WHERE "priority" IS NULL;
