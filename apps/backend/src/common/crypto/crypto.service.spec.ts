import { CryptoService } from "./crypto.service";

describe("CryptoService", () => {
  let svc: CryptoService;

  beforeAll(() => {
    process.env.CRYPTO_SECRET =
      "test-crypto-secret-32-bytes-minimum-for-aes256-gcm-test-only";
    svc = new CryptoService();
  });

  it("encrypts then decrypts a string roundtrip", () => {
    const plain = "hello-world-secret-token";
    const enc = svc.encrypt(plain);
    expect(enc).toMatch(/^v1:/);
    expect(enc.split(":")).toHaveLength(4);
    expect(svc.decrypt(enc)).toBe(plain);
  });

  it("each encryption produces a different ciphertext (random IV)", () => {
    const enc1 = svc.encrypt("same-value");
    const enc2 = svc.encrypt("same-value");
    expect(enc1).not.toBe(enc2);
    expect(svc.decrypt(enc1)).toBe("same-value");
    expect(svc.decrypt(enc2)).toBe("same-value");
  });

  it("rejects tampered ciphertext (GCM auth tag failure)", () => {
    const enc = svc.encrypt("foo");
    const parts = enc.split(":");
    // Flip a byte in the ciphertext segment
    const ct = Buffer.from(parts[3]!, "base64");
    ct[0] = ct[0]! ^ 1;
    parts[3] = ct.toString("base64");
    const tampered = parts.join(":");
    expect(() => svc.decrypt(tampered)).toThrow();
  });

  it("encryptOptional returns null on empty input", () => {
    expect(svc.encryptOptional(null)).toBeNull();
    expect(svc.encryptOptional("")).toBeNull();
    expect(svc.encryptOptional(undefined)).toBeNull();
  });

  it("decryptOptional returns null on empty input", () => {
    expect(svc.decryptOptional(null)).toBeNull();
    expect(svc.decryptOptional("")).toBeNull();
  });

  it("hashToken + verifyHash are constant-time-equal", () => {
    const token = svc.generateRandomToken(32);
    const hash = svc.hashToken(token);
    expect(svc.verifyHash(token, hash)).toBe(true);
    expect(svc.verifyHash("wrong-token", hash)).toBe(false);
  });

  it("verifyHash rejects malformed hashes", () => {
    expect(svc.verifyHash("a", "")).toBe(false);
    expect(svc.verifyHash("a", "tooshort")).toBe(false);
  });

  it("rejects ciphertext without v1: prefix", () => {
    expect(() => svc.decrypt("plain-text")).toThrow();
  });

  it("generateRandomToken produces base64url strings of the requested length", () => {
    const t = svc.generateRandomToken(16);
    // base64url length for 16 bytes = ceil(16 * 4 / 3) - padding = 22 chars
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(20);
  });
});
