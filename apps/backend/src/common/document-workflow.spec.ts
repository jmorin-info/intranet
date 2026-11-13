import { getStatusTransitions, isLegalStatusTransition } from "./document-workflow";
import { UserRole } from "./enums";

describe("document-workflow transition matrix", () => {
  describe("getStatusTransitions", () => {
    it("DRAFT → IN_REVIEW pour tout rôle, ARCHIVED réservé ADMIN", () => {
      expect(getStatusTransitions("DRAFT", UserRole.COLLABORATEUR)).toEqual(["IN_REVIEW"]);
      expect(getStatusTransitions("DRAFT", UserRole.ADMIN)).toEqual(
        expect.arrayContaining(["IN_REVIEW", "ARCHIVED"]),
      );
    });

    it("IN_REVIEW → REVIEW_APPROVED réservé REVIEWER+ (séparation 4-yeux)", () => {
      expect(getStatusTransitions("IN_REVIEW", UserRole.COLLABORATEUR)).toEqual(["DRAFT"]);
      expect(getStatusTransitions("IN_REVIEW", UserRole.REVIEWER)).toEqual(
        expect.arrayContaining(["DRAFT", "REVIEW_APPROVED"]),
      );
    });

    it("PENDING_APPROVAL → APPROVED réservé DIRECTION+", () => {
      expect(getStatusTransitions("PENDING_APPROVAL", UserRole.COLLABORATEUR)).toEqual([]);
      expect(getStatusTransitions("PENDING_APPROVAL", UserRole.DIRECTION)).toEqual(
        expect.arrayContaining(["APPROVED"]),
      );
    });
  });

  describe("isLegalStatusTransition", () => {
    it("rejette un saut illégal DRAFT → APPROVED (même ADMIN)", () => {
      expect(isLegalStatusTransition("DRAFT", "APPROVED", UserRole.ADMIN)).toBe(false);
    });

    it("interdit à un COLLABORATEUR de PATCHer PENDING_APPROVAL → APPROVED (4-yeux)", () => {
      expect(isLegalStatusTransition("PENDING_APPROVAL", "APPROVED", UserRole.COLLABORATEUR)).toBe(
        false,
      );
    });

    it("autorise les transitions légales", () => {
      expect(isLegalStatusTransition("DRAFT", "IN_REVIEW", UserRole.COLLABORATEUR)).toBe(true);
      expect(isLegalStatusTransition("PENDING_APPROVAL", "APPROVED", UserRole.DIRECTION)).toBe(
        true,
      );
    });

    it("considère une transition sur place (from === to) comme neutre", () => {
      expect(isLegalStatusTransition("APPROVED", "APPROVED", UserRole.COLLABORATEUR)).toBe(true);
    });
  });
});
