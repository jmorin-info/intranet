-- Ajoute une préférence de langue UI au niveau utilisateur, pour la retrouver
-- après un login depuis n'importe quel navigateur. Fallback : 'fr'.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "locale" TEXT DEFAULT 'fr';
