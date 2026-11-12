import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "../safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    undefined,
    null,
    "",
    "https://external.invalid/",
    "//external.invalid/path",
    "javascript:alert(document.domain)",
    "data:text/html,test",
    "/\\external.invalid/",
    "/%5cexternal.invalid/",
    "/%2fexternal.invalid/",
    "/%2F%2Fexternal.invalid/",
    "/\n/external.invalid/",
    "/%0a/external.invalid/",
    "/a/..//external.invalid/",
    "/%2e%2e//external.invalid/",
    " /dashboard",
  ])("refuses an unsafe return destination: %s", (value) => {
    expect(safeRedirectPath(value)).toBe("/dashboard");
  });

  it.each([
    "/dashboard",
    "/documents/123?tab=versions#latest",
    "/search?q=https%3A%2F%2Fexternal.invalid",
    "/wiki/%C3%A9quipe",
    "/",
  ])("preserves an internal destination: %s", (value) => {
    expect(safeRedirectPath(value)).toBe(value);
  });

  it("normalizes dot segments without producing a network-path reference", () => {
    expect(safeRedirectPath("/documents/../dashboard?tab=recent")).toBe(
      "/dashboard?tab=recent",
    );
  });
});
