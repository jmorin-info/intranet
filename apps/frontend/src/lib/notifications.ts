import { isRouteEnabled } from './features';

interface NotificationResource {
  type: string;
  resourceType?: string | null;
  resourceId?: string | null;
}

export function isVeilleNotification(n: Pick<NotificationResource, 'type' | 'resourceType'>): boolean {
  return n.type.startsWith('VEILLE_') || n.resourceType === 'VeilleItem' || n.resourceType === 'VeilleBulletin';
}

/** Shared by the notification inbox and the header bell. */
export function getNotificationAction(
  n: NotificationResource,
  routeEnabled: (href: string) => boolean = isRouteEnabled,
): { label: string; href: string } | null {
  if (isVeilleNotification(n)) {
    return routeEnabled('/veille') ? { label: 'Voir la veille', href: '/veille' } : null;
  }
  // Resolve the resource before the generic legacy SIGNATURE_NEEDED type:
  // a campaign or document signature must never open the charter wall.
  if (['SIGNATURE_CAMPAIGN', 'SignatureCampaign', 'SignatureRequest'].includes(n.resourceType || '')) {
    return { label: 'Voir mes signatures', href: '/signatures' };
  }
  if (n.resourceType === 'Charte') {
    return n.type === 'DOC_APPROVAL_NEEDED'
      ? { label: 'Valider la charte', href: '/admin/chartes' }
      : { label: 'Attester la lecture', href: '/chartes' };
  }
  if (n.resourceType === 'Document' && n.resourceId) {
    const label = n.type === 'ACK_REQUIRED' ? 'Accuser réception'
      : n.type === 'DOC_APPROVAL_NEEDED' ? 'Approuver' : 'Voir le document';
    return { label, href: `/documents/${encodeURIComponent(n.resourceId)}` };
  }
  if (n.resourceType === 'Ticket' && n.resourceId) {
    return { label: 'Voir le ticket', href: `/tickets/${encodeURIComponent(n.resourceId)}` };
  }
  if (n.resourceType === 'NewsPost' && n.resourceId) {
    // Notifications carry the database ID, while /news/:slug accepts a slug.
    // Until the API supplies a resolvable slug, open the list instead of a 404.
    return { label: 'Voir les actualités', href: '/news' };
  }
  if (n.type === 'SIGNATURE_NEEDED') {
    return { label: 'Voir mes signatures', href: '/signatures' };
  }
  return null;
}
