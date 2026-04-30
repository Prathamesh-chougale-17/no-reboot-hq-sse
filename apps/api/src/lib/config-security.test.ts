import { describe, expect, it } from "vitest";

import {
  createConfigChecksum,
  decryptConfigSecret,
  encryptConfigSecret,
  getServiceTokenPrefix,
  hashServiceToken,
  normalizeConfigValue,
} from "./config-security";

const encryptionKey = "local-config-encryption-key-32-bytes";
const tokenPepper = "local-config-token-pepper-32-bytes";

describe("config security helpers", () => {
  it("encrypts and decrypts secret config values without exposing plaintext", () => {
    const encrypted = encryptConfigSecret("super-secret-value", encryptionKey);

    expect(encrypted).toMatch(/^nrhq_secret_v1\./);
    expect(encrypted).not.toContain("super-secret-value");
    expect(decryptConfigSecret(encrypted, encryptionKey)).toBe(
      "super-secret-value",
    );
  });

  it("creates stable checksums for objects regardless of key order", () => {
    expect(createConfigChecksum({ b: 2, a: 1 })).toBe(
      createConfigChecksum({ a: 1, b: 2 }),
    );
  });

  it("hashes service tokens with pepper and exposes only a prefix", () => {
    const secret = "nrhq_sk_test-token-secret";
    const hash = hashServiceToken(secret, tokenPepper);

    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashServiceToken(secret, tokenPepper));
    expect(hash).not.toContain(secret);
    expect(getServiceTokenPrefix(secret)).toBe("nrhq_sk_test-token");
  });

  it("normalizes typed config values before persistence", () => {
    expect(normalizeConfigValue("number", "42")).toBe(42);
    expect(normalizeConfigValue("boolean", "true")).toBe(true);
    expect(normalizeConfigValue("json", '{"enabled":true}')).toEqual({
      enabled: true,
    });
    expect(normalizeConfigValue("secret", 1234)).toBe("1234");
  });
});
