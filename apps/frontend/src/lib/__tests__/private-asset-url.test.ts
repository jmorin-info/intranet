import { describe, expect, it } from "vitest";
import { certificateAssetUrl, wikiAttachmentUrl } from "../private-asset-url";

describe("private asset URLs", () => {
  it("routes legacy wiki links through the authenticated attachment endpoint", () => {
    expect(wikiAttachmentUrl("/uploads/wiki/123-guide.pdf")).toBe(
      "/api/v1/wiki/attachments/123-guide.pdf",
    );
  });

  it.each([
    "/api/v1/wiki/attachments/123-guide.pdf",
    "https://example.invalid/uploads/wiki/image.png",
    "/wiki?page=guide",
  ])("does not rewrite unrelated or already migrated URLs: %s", (url) => {
    expect(wikiAttachmentUrl(url)).toBe(url);
  });

  it("uses certificate identity rather than an untrusted stored file location", () => {
    expect(certificateAssetUrl("cert-123")).toBe("/api/v1/certificates/cert-123/download");
    expect(certificateAssetUrl("cert-123", "thumbnail")).toBe(
      "/api/v1/certificates/cert-123/thumbnail",
    );
  });

  it("encodes a certificate ID as one path segment", () => {
    expect(certificateAssetUrl("../secret?x=1")).toBe(
      "/api/v1/certificates/..%2Fsecret%3Fx%3D1/download",
    );
  });
});
