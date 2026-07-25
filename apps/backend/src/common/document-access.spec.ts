import {
  canAccessDocumentByClassification,
  ClassifiedDocument,
  DocumentAccessUser,
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
