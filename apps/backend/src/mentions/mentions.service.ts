import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Extrait les mentions @utilisateur d'un texte libre et notifie les
 * utilisateurs correspondants.
 *
 * Patterns reconnus (dans l'ordre de priorité) :
 *   1. @firstname.lastname (ex: @jean.dupont)
 *   2. @firstname-lastname (ex: @jean-dupont)
 *   3. @local-part-of-email (ex: @jean.dupont si email jean.dupont@xxx)
 *
 * Ignoré :
 *   - Mentions dans des URL ou adresses mail (précédées de `http` ou `@`)
 *   - Mentions dans des blocs code markdown (```...```)
 */
@Injectable()
export class MentionsService {
  private readonly logger = new Logger(MentionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Parse un texte et retourne la liste de handles mentionnés (sans le @).
   */
  extractHandles(text: string): string[] {
    if (!text) return [];
    // Retire les blocs code markdown (```…```) et inline code (`…`) : mentions dedans ignorées.
    const stripped = text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`\n]*`/g, ' ');
    // Pattern : @ suivi d'un identifiant, précédé d'un espace, début de ligne ou ponctuation légère.
    // Négatif : ne match pas si précédé de "//", "@", ou d'un caractère alphanumérique (évite emails).
    const matches = [...stripped.matchAll(/(^|[\s\(\[\{>,;])@([a-zA-Z][a-zA-Z0-9_.\-]{1,62})/g)];
    const handles = new Set<string>();
    for (const m of matches) {
      const handle = m[2]!.toLowerCase().replace(/[.,;]+$/, '');
      if (handle) handles.add(handle);
    }
    return [...handles];
  }

  /**
   * Résout les handles en utilisateurs actifs via leur email local-part,
   * leur `firstname.lastname` ou leur `firstname-lastname`.
   */
  async resolveHandles(handles: string[]): Promise<Array<{ id: string; email: string; fullName: string }>> {
    if (handles.length === 0) return [];
    const byLocalPart = handles;
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          // Match email local-part (before @)
          { email: { in: byLocalPart.map((h) => `${h}@omnitech-security.fr`) } },
          // Fallback : check any email starting with the handle
          ...byLocalPart.map((h) => ({ email: { startsWith: `${h}@`, mode: 'insensitive' as const } })),
        ],
      },
      select: { id: true, email: true, firstName: true, lastName: true },
      take: 50,
    });

    // Dedup + match par firstname.lastname
    const seen = new Set<string>();
    const result: Array<{ id: string; email: string; fullName: string }> = [];
    for (const u of users) {
      if (seen.has(u.id)) continue;
      const handle1 = `${u.firstName}.${u.lastName}`.toLowerCase();
      const handle2 = `${u.firstName}-${u.lastName}`.toLowerCase();
      const handle3 = u.email.split('@')[0]?.toLowerCase() || '';
      if (byLocalPart.some((h) => h === handle1 || h === handle2 || h === handle3)) {
        seen.add(u.id);
        result.push({
          id: u.id,
          email: u.email,
          fullName: `${u.firstName} ${u.lastName}`.trim(),
        });
      }
    }
    return result;
  }

  /**
   * Parse le texte, résout les mentions, et notifie chaque utilisateur mentionné.
   * Ne notifie pas l'auteur lui-même (évite les auto-notifications).
   */
  async parseAndNotify(params: {
    text: string;
    authorId: string;
    authorName: string;
    sourceType: 'comment' | 'ticket' | 'wiki' | 'news' | 'document';
    sourceId: string;
    sourceTitle: string;
    link: string;
  }): Promise<number> {
    const handles = this.extractHandles(params.text);
    if (handles.length === 0) return 0;

    const users = await this.resolveHandles(handles);
    const recipients = users.filter((u) => u.id !== params.authorId);

    if (recipients.length === 0) return 0;

    const label: Record<string, string> = {
      comment: 'commentaire',
      ticket: 'ticket',
      wiki: 'page wiki',
      news: 'actualité',
      document: 'document',
    };
    const kind = label[params.sourceType] ?? 'contenu';
    const title = `${params.authorName} vous a mentionné dans un ${kind}`;
    const excerpt = params.text.length > 180 ? params.text.slice(0, 180) + '…' : params.text;

    await Promise.all(
      recipients.map((r) =>
        this.notifications
          .create({
            userId: r.id,
            // TODO: review type safety — 'MENTION' n'est pas dans
            // l'enum Prisma NotificationType (cf. schema.prisma:53-67) :
            // l'INSERT côté DB échoue silencieusement. À ajouter via migration
            // ALTER TYPE avant de garantir le runtime.
            type: 'MENTION',
            title,
            body: `${params.sourceTitle}\n\n${excerpt}`,
            resourceType: params.sourceType,
            resourceId: params.sourceId,
            metadata: { link: params.link, author: params.authorName },
          })
          .catch((err) => {
            this.logger.warn(
              `Failed to notify mention for ${r.email}: ${err instanceof Error ? err.message : err}`,
            );
          }),
      ),
    );

    this.logger.log(
      `[mention] ${params.authorName} mentioned ${recipients.length} user(s) in ${params.sourceType}:${params.sourceId}`,
    );
    return recipients.length;
  }
}
