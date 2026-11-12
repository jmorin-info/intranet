import { documentReadWhere, hasBaselineDocumentReadAccess, DOCUMENT_STATUS_GROUPS } from './document-library.policy';
import { RequestUser } from '../common/interfaces';

const reader = (role: string) => ({ id: 'reader', role }) as RequestUser;
const document = { ownerId: 'owner', classification: 'INTERNE', status: 'APPROVED' };

describe('Document library read policy', () => {
  it.each([
    ['PRESTATAIRE', 'PUBLIC', 'APPROVED', true],
    ['PRESTATAIRE', 'INTERNE', 'APPROVED', false],
    ['COLLABORATEUR', 'INTERNE', 'DRAFT', false],
    ['COLLABORATEUR', 'INTERNE', 'APPROVED', true],
    ['AUDITEUR', 'CONFIDENTIEL', 'APPROVED', true],
    ['AUDITEUR', 'CONFIDENTIEL', 'IN_REVIEW', false],
    ['MANAGER', 'CONFIDENTIEL', 'IN_REVIEW', true],
    ['MANAGER', 'SECRET', 'APPROVED', false],
    ['REVIEWER', 'SECRET', 'DRAFT', false],
    ['DIRECTION', 'SECRET', 'DRAFT', true],
    ['UNKNOWN', 'PUBLIC', 'APPROVED', false],
  ])('checks %s access to %s / %s', (role, classification, status, expected) => {
    expect(hasBaselineDocumentReadAccess({ ...document, classification, status }, reader(role))).toBe(expected);
  });

  it('grants owner and assigned actors access while excluding deleted documents', () => {
    expect(hasBaselineDocumentReadAccess({ ...document, status: 'DRAFT', ownerId: 'reader' }, reader('COLLABORATEUR'))).toBe(true);
    expect(hasBaselineDocumentReadAccess({ ...document, classification: 'SECRET', reviewerId: 'reader' }, reader('REVIEWER'))).toBe(true);
    expect(hasBaselineDocumentReadAccess({ ...document, deletedAt: new Date() }, reader('ADMIN'))).toBe(false);
  });

  it('restricts SQL permissions to recognized levels, unexpired grants and exact workflow versions', () => {
    const now = new Date('2026-11-12T10:00:00Z');
    const where = documentReadWhere(reader('MANAGER'), ['department'], now, [{ documentId: 'secret', documentVersionId: 'v2' }]);
    expect(where).toMatchObject({ deletedAt: null, OR: expect.arrayContaining([
      { classification: { in: ['PUBLIC', 'INTERNE', 'CONFIDENTIEL'] } },
      { id: 'secret', currentVersionId: 'v2' },
      { permissions: { some: { level: { in: ['READ', 'COMMENT', 'EDIT', 'ADMIN'] }, AND: expect.arrayContaining([{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }]) } } },
    ]) });
    expect(documentReadWhere(reader('UNKNOWN'), [])).toEqual({ deletedAt: null, id: { in: [] } });
    expect(DOCUMENT_STATUS_GROUPS.review).toEqual(['IN_REVIEW', 'REVIEW_APPROVED', 'PENDING_APPROVAL']);
  });
});
