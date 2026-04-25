-- Certificats — vignette d'aperçu pour la liste admin.
-- thumbnailUrl est généré à l'upload (sharp pour images, pdftoppm pour PDF).
-- null si génération impossible (binary absent, type non supporté, erreur).

ALTER TABLE "Certificate"
    ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT;
