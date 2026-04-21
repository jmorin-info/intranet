/**
 * Régénère les posters (thumbnails) + durée des vidéos médiathèque déjà uploadées
 * avant l'installation de ffmpeg.
 *
 * Contexte : lors du MVP Phase 1 de la médiathèque, ffmpeg n'était pas installé
 * sur la VM. Les vidéos uploadées avaient donc un placeholder SVG générique
 * comme vignette, et durationSec = null. Depuis l'install de ffmpeg (2026-04-21),
 * toute NOUVELLE vidéo uploadée a un vrai poster extrait à t=1s + durée.
 * Ce script balaie la DB et re-génère tout ce qui manque.
 *
 * Usage :
 *   cd /root/omnitech-intranet
 *   npx tsx scripts/regenerate-video-posters.ts
 *   # OU (si tsx pas dispo) :
 *   node --loader=ts-node/esm scripts/regenerate-video-posters.ts
 *
 * Options (env) :
 *   DRY_RUN=1  → liste les items à traiter sans rien régénérer
 *   LIMIT=10   → limite le nombre de vidéos traitées (pour test)
 */

import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';

const prisma = new PrismaClient();
const MEDIA_ROOT = path.join(process.cwd(), 'storage', 'media');
const THUMB_SIZE = 600;
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;

async function extractPoster(videoPath: string, destWebpPath: string): Promise<boolean> {
  const tmpJpg = `${destWebpPath}.frame.jpg`;
  const ok = await new Promise<boolean>((resolve) => {
    const ff = spawn(
      'ffmpeg',
      ['-y', '-ss', '00:00:01', '-i', videoPath, '-vframes', '1', '-q:v', '2', tmpJpg],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    ff.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    ff.on('error', () => resolve(false));
    ff.on('close', (code) => {
      if (code !== 0) {
        console.warn(`  ffmpeg exit=${code} stderr=${stderr.slice(-200)}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
    setTimeout(() => { ff.kill('SIGKILL'); resolve(false); }, 60_000);
  });

  if (!ok) return false;

  try {
    await sharp(tmpJpg)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toFile(destWebpPath);
    return true;
  } catch (err) {
    console.warn(`  sharp resize échoué : ${err instanceof Error ? err.message : err}`);
    return false;
  } finally {
    await fs.rm(tmpJpg, { force: true }).catch(() => { /* ignore */ });
  }
}

async function probeDuration(videoPath: string): Promise<number | null> {
  return new Promise<number | null>((resolve) => {
    const ff = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let stdout = '';
    ff.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    ff.on('error', () => resolve(null));
    ff.on('close', (code) => {
      if (code !== 0) return resolve(null);
      const parsed = parseFloat(stdout.trim());
      resolve(Number.isFinite(parsed) ? Math.round(parsed) : null);
    });
    setTimeout(() => { ff.kill('SIGKILL'); resolve(null); }, 15_000);
  });
}

async function main() {
  console.log(`=== Régénération posters vidéo médiathèque ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  // Liste toutes les vidéos en DB
  const videos = await prisma.mediaItem.findMany({
    where: { type: 'VIDEO' },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`${videos.length} vidéo(s) trouvée(s) en DB`);
  if (videos.length === 0) { await prisma.$disconnect(); return; }

  // Filtre : durée manquante OU posterUrl absent (fallback placeholder)
  const toRegenerate = videos.filter((v) => v.durationSec === null || v.posterUrl === null);
  console.log(`${toRegenerate.length} à régénérer (duration ou poster manquant)\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const video of toRegenerate.slice(0, LIMIT)) {
    const albumDir = path.join(MEDIA_ROOT, 'albums', video.albumId);
    const metaPath = path.join(albumDir, `${video.id}.meta.json`);

    try {
      const metaRaw = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(metaRaw) as { originalFilename: string; thumbFilename: string };
      const originalPath = path.join(albumDir, 'originals', meta.originalFilename);
      const thumbPath = path.join(albumDir, 'thumbs', meta.thumbFilename);

      console.log(`- ${video.id} (${meta.originalFilename})`);

      // Vérifie que le fichier source existe
      try { await fs.access(originalPath); }
      catch {
        console.warn(`  fichier source absent : ${originalPath} — SKIP`);
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [dry-run] régénérerait poster + durée`);
        skipped++;
        continue;
      }

      const [posterOk, duration] = await Promise.all([
        extractPoster(originalPath, thumbPath),
        probeDuration(originalPath),
      ]);

      if (posterOk || duration !== null) {
        await prisma.mediaItem.update({
          where: { id: video.id },
          data: {
            ...(duration !== null ? { durationSec: duration } : {}),
            ...(posterOk ? { posterUrl: video.thumbnailUrl } : {}),
          },
        });
        console.log(`  ✓ poster=${posterOk ? 'OK' : 'KO'} durée=${duration ?? 'n/a'}s`);
        success++;
      } else {
        console.warn(`  ✗ poster + durée échoués`);
        failed++;
      }
    } catch (err) {
      console.warn(`  erreur : ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  console.log(`\n=== Résultat ===`);
  console.log(`  Régénérés : ${success}`);
  console.log(`  Ignorés   : ${skipped}`);
  console.log(`  Échoués   : ${failed}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
