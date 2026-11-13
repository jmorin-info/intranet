import { describe, expect, it } from 'vitest';
import { getNotificationAction, isVeilleNotification } from '../notifications';

describe('Notification destinations', () => {
  it.each(['SIGNATURE_CAMPAIGN', 'SignatureCampaign', 'SignatureRequest'])(
    'opens signatures for %s even with the legacy signature type', (resourceType) => {
      expect(getNotificationAction({ type: 'SIGNATURE_NEEDED', resourceType, resourceId: 'campaign-id' }))
        .toEqual({ label: 'Voir mes signatures', href: '/signatures' });
    },
  );
  it('distinguishes a charter approval, a charter attestation and a document acknowledgement', () => {
    expect(getNotificationAction({ type: 'DOC_APPROVAL_NEEDED', resourceType: 'Charte' })?.href).toBe('/admin/chartes');
    expect(getNotificationAction({ type: 'SIGNATURE_NEEDED', resourceType: 'Charte' })?.href).toBe('/chartes');
    expect(getNotificationAction({ type: 'ACK_REQUIRED', resourceType: 'Document', resourceId: 'doc' }))
      .toEqual({ label: 'Accuser réception', href: '/documents/doc' });
    expect(getNotificationAction({ type: 'SIGNATURE_NEEDED' })?.href).toBe('/signatures');
  });
  it('does not link to a disabled veille module, including legacy notifications', () => {
    for (const notification of [{ type: 'VEILLE_CRITICAL' }, { type: 'DOC_PUBLISHED', resourceType: 'VeilleItem' }]) {
      expect(isVeilleNotification(notification)).toBe(true);
      expect(getNotificationAction(notification, () => false)).toBeNull();
      expect(getNotificationAction(notification, () => true)?.href).toBe('/veille');
    }
  });
  it('keeps an identifier in its own route segment and leaves unknown resources without a link', () => {
    expect(getNotificationAction({ type: 'TICKET_CREATED', resourceType: 'Ticket', resourceId: 'id/?q=x' })?.href)
      .toBe('/tickets/id%2F%3Fq%3Dx');
    expect(getNotificationAction({ type: 'GENERAL' })).toBeNull();
  });
  it('does not treat a news database ID as an article slug', () => {
    expect(getNotificationAction({ type: 'NEWS_POSTED', resourceType: 'NewsPost', resourceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }))
      .toEqual({ label: 'Voir les actualités', href: '/news' });
  });
});
