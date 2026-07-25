// =============================================================================
// OMNITECH Security Intranet — Purge du backlog de notifications « veille »
// -----------------------------------------------------------------------------
// Remédiation du spam de notifications veille (juillet 2026). Supprime les
// notifications du module veille accumulées dans la table Notification :
//   - toute notification dont resourceType ∈ {VeilleItem, VeilleBulletin}
//     (couvre les notifs LEGACY émises en type générique DOC_PUBLISHED avant
//      l'introduction des types dédiés le 2026-07-23) ;
//   - toute notification de type VEILLE_CRITICAL / VEILLE_BULLETIN.
//
// Contexte : ~1 310 notifs veille (62 % de la table), dont ~1 055 non lues →
// badge cloche bloqué à « 99+ » chez les administrateurs.
//
// SÉCURITÉ : DRY-RUN PAR DÉFAUT. Le script COMPTE et LOGUE par utilisateur
// (lu / non lu) AVANT toute suppression. Aucune ligne n'est supprimée sans le
// drapeau explicite --apply.
//
// Usage :
//   npx tsx prisma/maintenance/purge-veille-spam.ts                 # dry-run
//   npx tsx prisma/maintenance/purge-veille-spam.ts --apply         # suppression
//   npx tsx prisma/maintenance/purge-veille-spam.ts --older-than-days=14
//   npx tsx prisma/maintenance/purge-veille-spam.ts --only-unread --apply
//
// Options :
//   --apply                 exécute réellement la suppression (sinon dry-run)
//   --older-than-days=N     ne cible que les notifs créées il y a plus de N
//                           jours (défaut 0 = toutes)
//   --only-read             ne cible que les notifs LUES
//   --only-unread           ne cible que les notifs NON LUES
// =============================================================================

import { readFileSync } from "fs";
import { resolve } from "path";

// Charge le .env de la racine du monorepo si DATABASE_URL n'est pas déjà défini.
if (!process.env.DATABASE_URL) {
  for (const rel of ["../../../../.env", "../../../.env"]) {
    try {
      const envPath = resolve(__dirname, rel);
      const envContent = readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
      if (process.env.DATABASE_URL) break;
    } catch {
      /* ignore, essaie le chemin suivant */
    }
  }
}

import { PrismaClient, Prisma, NotificationType } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Parsing des arguments
// ---------------------------------------------------------------------------

interface Options {
  apply: boolean;
  olderThanDays: number;
  onlyRead: boolean;
  onlyUnread: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    apply: false,
    olderThanDays: 0,
    onlyRead: false,
    onlyUnread: false,
  };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--only-read") opts.onlyRead = true;
    else if (arg === "--only-unread") opts.onlyUnread = true;
    else if (arg.startsWith("--older-than-days=")) {
      const n = parseInt(arg.split("=")[1] ?? "", 10);
      if (Number.isFinite(n) && n >= 0) opts.olderThanDays = n;
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Construction du prédicat « notification veille »
// ---------------------------------------------------------------------------

function buildWhere(opts: Options): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = {
    // Notif veille = resourceType veille (legacy DOC_PUBLISHED inclus) OU type dédié.
    OR: [
      { resourceType: { in: ["VeilleItem", "VeilleBulletin"] } },
      {
        type: {
          in: [NotificationType.VEILLE_CRITICAL, NotificationType.VEILLE_BULLETIN],
        },
      },
    ],
  };

  if (opts.olderThanDays > 0) {
    where.createdAt = {
      lt: new Date(Date.now() - opts.olderThanDays * 86400000),
    };
  }
  if (opts.onlyRead && !opts.onlyUnread) where.isRead = true;
  if (opts.onlyUnread && !opts.onlyRead) where.isRead = false;

  return where;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const where = buildWhere(opts);

  console.log("========================================================");
  console.log("[purge-veille-spam] Purge du backlog de notifications veille");
  console.log(
    `  Mode              : ${opts.apply ? "APPLY (suppression)" : "DRY-RUN (aucune suppression)"}`,
  );
  console.log(
    `  Âge minimum       : ${opts.olderThanDays > 0 ? `> ${opts.olderThanDays} jours` : "toutes"}`,
  );
  console.log(
    `  Filtre état       : ${opts.onlyRead ? "lues uniquement" : opts.onlyUnread ? "non lues uniquement" : "lues + non lues"}`,
  );
  console.log("========================================================\n");

  // 1. Comptages globaux (toujours, avant toute suppression).
  const [total, readCount, unreadCount] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, isRead: true } }),
    prisma.notification.count({ where: { ...where, isRead: false } }),
  ]);

  if (total === 0) {
    console.log("[purge-veille-spam] Aucune notification veille ciblée. Rien à faire.");
    return;
  }

  // 2. Répartition par utilisateur (compte + email pour lisibilité).
  const grouped = await prisma.notification.groupBy({
    by: ["userId"],
    where,
    _count: { _all: true },
  });
  grouped.sort((a, b) => b._count._all - a._count._all);

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  console.log(
    `[purge-veille-spam] ${total} notification(s) veille ciblée(s) — ${readCount} lue(s), ${unreadCount} non lue(s)\n`,
  );
  console.log("  Répartition par utilisateur :");
  for (const g of grouped) {
    const u = userById.get(g.userId);
    const who = u
      ? `${u.firstName ?? ""} ${u.lastName ?? ""} <${u.email}>`.trim()
      : `(utilisateur supprimé: ${g.userId})`;
    console.log(`    - ${who} : ${g._count._all}`);
  }
  console.log("");

  // 3. Suppression (uniquement en --apply).
  if (!opts.apply) {
    console.log("[purge-veille-spam] DRY-RUN — aucune suppression effectuée.");
    console.log("  Relancer avec --apply pour supprimer ces notifications.");
    return;
  }

  const deleted = await prisma.notification.deleteMany({ where });
  console.log(`[purge-veille-spam] APPLY — ${deleted.count} notification(s) veille supprimée(s).`);
  console.log(
    "  Pensez à invalider le cache Redis unread-count (ou attendre le TTL) " +
      "pour rafraîchir le badge cloche des utilisateurs.",
  );
}

main()
  .catch((e) => {
    console.error("[purge-veille-spam] Fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
