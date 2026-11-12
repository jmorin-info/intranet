import { canAccessDocumentByClassification, canReadDocument, ReadableDocument, DocumentAccessUser, canReadDocumentWithPermissions, documentReaderScope } from './document-access';
import { hasBaselineDocumentReadAccess } from './document-library.policy';
import { RequestUser } from './interfaces';
const user = (id: string, role = 'COLLABORATEUR'): DocumentAccessUser => ({ id, role });

describe("canReadDocument", () => {
  const rdoc = (o: Partial<ReadableDocument> = {}): ReadableDocument => ({
    classification: "INTERNE",
    ownerId: "owner",
    reviewerId: null,
    approverId: null,
    status: "APPROVED",
    deletedAt: null,
    category: "PROCEDURE",
    isPublic: false,
    ...o,
  });

  it("un document soft-supprimé n'est lisible par personne, pas même un ADMIN", () => {
    expect(canReadDocument(rdoc({ deletedAt: new Date() }), user("x", "ADMIN"))).toBe(false);
    expect(canReadDocument(rdoc({ deletedAt: new Date() }), user("owner", "COLLABORATEUR"))).toBe(
      false,
    );
  });

  it.each(["SUPER_ADMIN", "ADMIN", "DIRECTION"])(
    "%s lit un brouillon SECRET non supprimé",
    (role) => {
      expect(
        canReadDocument(rdoc({ status: "DRAFT", classification: "SECRET" }), user("x", role)),
      ).toBe(true);
    },
  );

  describe("COLLABORATEUR non-owner", () => {
    it("REFUSE un brouillon INTERNE d'autrui (régression fermée)", () => {
      expect(
        canReadDocument(rdoc({ status: "DRAFT", classification: "INTERNE" }), user("bob")),
      ).toBe(false);
    });
    it("lit un INTERNE APPROVED", () => {
      expect(canReadDocument(rdoc({ status: "APPROVED" }), user("bob"))).toBe(true);
    });
    it("REFUSE un CONFIDENTIEL même APPROVED", () => {
      expect(
        canReadDocument(rdoc({ status: "APPROVED", classification: "CONFIDENTIEL" }), user("bob")),
      ).toBe(false);
    });
    it("lit son PROPRE brouillon", () => {
      expect(canReadDocument(rdoc({ status: "DRAFT" }), user("owner"))).toBe(true);
    });
  });

  describe("PRESTATAIRE non-owner", () => {
    it("REFUSE un INTERNE APPROVED (ni CONTRACT ni public)", () => {
      expect(
        canReadDocument(
          rdoc({ status: "APPROVED", category: "PROCEDURE" }),
          user("ext", "PRESTATAIRE"),
        ),
      ).toBe(false);
    });
    it("ne laisse pas une catégorie CONTRACT exposer un document INTERNE", () => {
      expect(
        canReadDocument(
          rdoc({ status: "APPROVED", category: "CONTRACT" }),
          user("ext", "PRESTATAIRE"),
        ),
      ).toBe(false);
    });
    it("REFUSE un CONTRACT en brouillon", () => {
      expect(
        canReadDocument(
          rdoc({ status: "DRAFT", category: "CONTRACT" }),
          user("ext", "PRESTATAIRE"),
        ),
      ).toBe(false);
    });
    it("lit un document public APPROVED", () => {
      expect(
        canReadDocument(
          rdoc({ status: "APPROVED", classification: "PUBLIC", category: "PROCEDURE", isPublic: true }),
          user("ext", "PRESTATAIRE"),
        ),
      ).toBe(true);
    });
  });

  describe("AUDITEUR", () => {
    it("lit un CONFIDENTIEL APPROVED", () => {
      expect(
        canReadDocument(
          rdoc({ status: "APPROVED", classification: "CONFIDENTIEL" }),
          user("a", "AUDITEUR"),
        ),
      ).toBe(true);
    });
    it("REFUSE un SECRET", () => {
      expect(
        canReadDocument(
          rdoc({ status: "APPROVED", classification: "SECRET" }),
          user("a", "AUDITEUR"),
        ),
      ).toBe(false);
    });
    it("REFUSE un CONFIDENTIEL non APPROVED", () => {
      expect(
        canReadDocument(
          rdoc({ status: "IN_REVIEW", classification: "CONFIDENTIEL" }),
          user("a", "AUDITEUR"),
        ),
      ).toBe(false);
    });
  });

  describe("REVIEWER", () => {
    it("lit un CONFIDENTIEL en brouillon", () => {
      expect(
        canReadDocument(
          rdoc({ status: "DRAFT", classification: "CONFIDENTIEL" }),
          user("r", "REVIEWER"),
        ),
      ).toBe(true);
    });
    it("REFUSE un SECRET dont il n'est pas owner", () => {
      expect(
        canReadDocument(
          rdoc({ classification: "SECRET", ownerId: "owner" }),
          user("r", "REVIEWER"),
        ),
      ).toBe(false);
    });
    it("lit son PROPRE SECRET", () => {
      expect(
        canReadDocument(rdoc({ classification: "SECRET", ownerId: "r" }), user("r", "REVIEWER")),
      ).toBe(true);
    });
  });

  it("rôle inconnu → fail closed", () => {
    expect(canReadDocument(rdoc({ status: "APPROVED" }), user("x", "GUEST"))).toBe(false);
  });
});


describe('One document policy across GED and content services', () => {
  it('compares every role, status and classification with the GED baseline', () => {
    const roles = ['SUPER_ADMIN', 'ADMIN', 'DIRECTION', 'MANAGER', 'REVIEWER', 'AUDITEUR', 'COLLABORATEUR', 'PRESTATAIRE', 'UNKNOWN'];
    const statuses = ['DRAFT', 'IN_REVIEW', 'REVIEW_APPROVED', 'PENDING_APPROVAL', 'APPROVED', 'OBSOLETE', 'ARCHIVED'];
    for (const role of roles) for (const status of statuses) for (const classification of ['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET', 'UNKNOWN']) {
      for (const actor of ['other', 'owner', 'assigned']) {
        const doc = { ownerId: 'owner', verifierId: 'assigned', status, classification };
        const reader = { id: actor, role };
        expect(canReadDocument(doc, reader)).toBe(hasBaselineDocumentReadAccess(doc, reader as RequestUser));
        expect(canAccessDocumentByClassification(doc, reader)).toBe(canReadDocument(doc, reader));
      }
    }
  });
  it('requires identity and status, even for privileged callers', () => {
    expect(canReadDocument({ ownerId: 'x', classification: 'PUBLIC', status: 'APPROVED' }, user('', 'ADMIN'))).toBe(false);
    expect(canAccessDocumentByClassification({ ownerId: 'x', classification: 'SECRET' }, user('admin', 'ADMIN'))).toBe(false);
    expect(canReadDocument({ ownerId: 'x', classification: 'SECRET', status: 'APPROVED', isPublic: true }, user('external', 'PRESTATAIRE'))).toBe(false);
  });
});

describe('Canonical SQL and object permissions', () => {
  let db: any;
  const reader = { id: 'reader', role: 'COLLABORATEUR', departmentId: 'primary' };
  const document = { id: 'doc', ownerId: 'other', status: 'DRAFT', classification: 'SECRET', currentVersionId: 'v1' };
  beforeEach(() => {
    db = {
      user: { findUnique: jest.fn().mockResolvedValue({ departmentId: 'primary' }) },
      userDepartment: { findMany: jest.fn().mockResolvedValue([{ departmentId: 'secondary' }]) },
      documentPermission: { findFirst: jest.fn().mockResolvedValue(null) },
      approvalStepInstance: { findMany: jest.fn().mockResolvedValue([]) },
    };
  });
  it('resolves valid explicit permissions before loading a summary or ISO content', async () => {
    db.documentPermission.findFirst.mockResolvedValue({ level: 'READ' });
    await expect(canReadDocumentWithPermissions(db, document, reader)).resolves.toBe(true);
    expect(db.documentPermission.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ documentId: 'doc', level: { in: ['READ', 'COMMENT', 'EDIT', 'ADMIN'] }, OR: expect.arrayContaining([{ departmentId: { in: ['primary', 'secondary'] } }]) }) }));
  });
  it('grants only the active workflow step and exact current version', async () => {
    db.approvalStepInstance.findMany.mockResolvedValue([{ step: { order: 1 }, instance: { currentStepOrder: 1, documentId: 'doc', documentVersionId: 'v1' } }]);
    await expect(canReadDocumentWithPermissions(db, document, reader)).resolves.toBe(true);
    await expect(canReadDocumentWithPermissions(db, { ...document, currentVersionId: 'v2' }, reader)).resolves.toBe(false);
    const scope = await documentReaderScope(db, reader);
    expect(scope).toMatchObject({ OR: expect.arrayContaining([{ id: 'doc', currentVersionId: 'v1' }]) });
    expect(db.approvalStepInstance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ assignedToId: null, step: { OR: [{ approverUserId: 'reader' }, { approverUserId: null, approverDeptId: 'primary' }, { approverUserId: null, approverDeptId: null, approverRole: 'COLLABORATEUR' }] } }]) }) }));
  });
  it('fails closed on database failure, unknown roles or missing identity', async () => {
    db.documentPermission.findFirst.mockRejectedValue(new Error('database unavailable'));
    await expect(canReadDocumentWithPermissions(db, document, reader)).resolves.toBe(false);
    await expect(documentReaderScope(db, { id: '', role: 'ADMIN' })).resolves.toEqual({ deletedAt: null, id: { in: [] } });
    await expect(documentReaderScope(db, { id: 'reader', role: 'UNKNOWN' })).resolves.toEqual({ deletedAt: null, id: { in: [] } });
  });
});
