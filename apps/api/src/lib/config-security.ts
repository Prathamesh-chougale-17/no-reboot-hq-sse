import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import type { ConfigValueType } from "@acme/shared";

const SECRET_PREFIX = "nrhq_secret_v1";
const SERVICE_TOKEN_PREFIX = "nrhq_sk";

const deriveKey = (seed: string): Buffer =>
  createHash("sha256").update(seed).digest();

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }

  return JSON.stringify(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = (value as Record<string, unknown>)[key];
        return accumulator;
      }, {}),
  );
};

export const normalizeConfigValue = (
  valueType: ConfigValueType,
  value: unknown,
): unknown => {
  switch (valueType) {
    case "string":
    case "secret":
      return typeof value === "string" ? value : String(value ?? "");
    case "number": {
      const parsed = typeof value === "number" ? value : Number(value);

      if (!Number.isFinite(parsed)) {
        throw new Error("Config value must be a finite number.");
      }

      return parsed;
    }
    case "boolean":
      if (typeof value === "boolean") {
        return value;
      }

      if (value === "true") {
        return true;
      }

      if (value === "false") {
        return false;
      }

      throw new Error("Config value must be a boolean.");
    case "json":
      if (typeof value === "string") {
        return JSON.parse(value) as unknown;
      }

      return value;
    default:
      return value;
  }
};

export const createConfigChecksum = (value: unknown): string =>
  createHash("sha256").update(stableStringify(value)).digest("hex");

export const encryptConfigSecret = (
  value: unknown,
  encryptionKey: string,
): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(encryptionKey), iv);
  const plaintext = Buffer.from(stableStringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    SECRET_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
};

export const decryptConfigSecret = (
  ciphertext: string,
  encryptionKey: string,
): unknown => {
  const [prefix, ivValue, tagValue, encryptedValue] = ciphertext.split(".");

  if (prefix !== SECRET_PREFIX || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Config secret ciphertext is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(encryptionKey),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(decrypted) as unknown;
};

export const generateServiceTokenSecret = (): string =>
  `${SERVICE_TOKEN_PREFIX}_${randomBytes(32).toString("base64url")}`;

export const hashServiceToken = (secret: string, pepper: string): string =>
  createHash("sha256").update(`${pepper}:${secret}`).digest("hex");

export const getServiceTokenPrefix = (secret: string): string =>
  secret.slice(0, 18);
