-- Médiathèque — image de couverture dédiée pour les albums.
-- Distincte de coverItemId (qui pointe vers un MediaItem existant). Permet
-- d'uploader une image dédiée stockée sous storage/media/albums/{id}/cover/.
-- Si présente, prime sur coverItem côté affichage public (page album, vignette).

ALTER TABLE "MediaAlbum"
    ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;
