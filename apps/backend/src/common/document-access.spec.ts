import {
  canAccessDocumentByClassification,
  canReadDocument,
  ClassifiedDocument,
  DocumentAccessUser,
  ReadableDocument,
} from "./document-access";

/**
 * Tests du contrôle d'accès documentaire par classification (ISO 27001 A.5.15).
 *
 * Ces règles conditionnent l'ouverture des routes IA (résumé, analyse ISO) à
 * tous les rôles authentifiés : le garde-fou n'est plus le rôle mais la
 * classification du document. Toute régression ici est une fuite de données.
 */

const doc = (o: Partial<ClassifiedDocument> = {}): ClassifiedDocument => ({
  classification: "INTERNE",
  ownerId: "owner",
  reviewerId: null,
  approverId: null,
  ...o,
});

const user = (id: string, role = "COLLABORATEUR"): DocumentAccessUser => ({ id, role });

describe("canAccessDocumentByClassification", () => {
  describe("rôles privilégiés", () => {
    it.each(["SUPER_ADMIN", "ADMIN", "DIRECTION"])("%s accède à tout, y compris SECRET", (role) => {
      expect(
        canAccessDocumentByClassification(doc({ classification: "SECRET" }), user("x", role)),
      ).toBe(true);
    });

    it("un rôle privilégié passe même sur une classification inconnue", () => {
      expect(
        canAccessDocumentByClassification(doc({ classification: "???" }), user("x", "ADMIN")),
      ).toBe(true);
    });
  });

  describe("PUBLIC / INTERNE", () => {
    it.each(["PUBLIC", "INTERNE"])("%s est lisible par tout authentifié", (classification) => {
      expect(canAccessDocumentByClassification(doc({ classification }), user("anyone"))).toBe(true);
    });
  });

  describe("CONFIDENTIEL", () => {
    const confidentiel = doc({
      classification: "CONFIDENTIEL",
      ownerId: "owner",
      reviewerId: "reviewer",
      approverId: "approver",
    });

    it.each([
      ["owner", "owner"],
      ["reviewer", "reviewer"],
      ["approver", "approver"],
    ])("%s du document y accède", (_label, id) => {
      expect(canAccessDocumentByClassification(confidentiel, user(id))).toBe(true);
    });

    it("un tiers non désigné est refusé", () => {
      expect(canAccessDocumentByClassification(confidentiel, user("tiers"))).toBe(false);
    });

    it("un REVIEWER global non désigné sur CE document est refusé", () => {
      // Le rôle ne suffit pas : c'est bien la désignation nominative qui compte.
      expect(canAccessDocumentByClassification(confidentiel, user("autre", "REVIEWER"))).toBe(
        false,
      );
    });
  });

  describe("SECRET", () => {
    const secret = doc({
      classification: "SECRET",
      ownerId: "owner",
      reviewerId: "reviewer",
      approverId: "approver",
    });

    it("seul l'owner accède", () => {
      expect(canAccessDocumentByClassification(secret, user("owner"))).toBe(true);
    });

    it.each(["reviewer", "approver", "tiers"])("%s est refusé", (id) => {
      expect(canAccessDocumentByClassification(secret, user(id))).toBe(false);
    });
  });

  describe("fail closed", () => {
    it.each(["", "INCONNUE", "TOP_SECRET", "public"])(
      "classification %p → refus (fail closed)",
      (classification) => {
        expect(canAccessDocumentByClassification(doc({ classification }), user("anyone"))).toBe(
          false,
        );
      },
    );

    it("ne se laisse pas contourner par un ownerId null côté document", () => {
      const orphan = doc({
        classification: "SECRET",
        ownerId: null as unknown as string,
      });
      // Un user sans id (edge case auth) ne doit pas matcher un owner null.
      expect(
        canAccessDocumentByClassification(orphan, { id: null as unknown as string, role: "X" }),
      ).toBe(false);
    });
  });
});

/**
 * Tests de canReadDocument — matrice complète rôle × statut × classification ×
 * soft-delete, alignée sur DocumentsService.findById. Ferme les régressions où
 * l'analyse ISO / le résumé IA ne regardaient QUE la classification (brouillons
 * et documents supprimés d'autrui restaient exposés).
 */
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
    it("lit un CONTRACT APPROVED", () => {
      expect(
        canReadDocument(
          rdoc({ status: "APPROVED", category: "CONTRACT" }),
          user("ext", "PRESTATAIRE"),
        ),
      ).toBe(true);
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
          rdoc({ status: "APPROVED", category: "PROCEDURE", isPublic: true }),
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
