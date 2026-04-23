-- Ajoute un champ linkUrl optionnel aux bannières prioritaires pour permettre
-- la redirection au clic (ex. promotion d'un article news, d'un quiz, etc.).
ALTER TABLE "Banner" ADD COLUMN IF NOT EXISTS "linkUrl" TEXT;
