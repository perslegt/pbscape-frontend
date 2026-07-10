import "server-only";

import { createHash, randomBytes } from "crypto";

const API_KEY_PREFIX = "pb_live_";
const RANDOM_KEY_LENGTH = 43;

export interface GeneratedApiKey {
  plaintext: string;
  prefix: string;
  hash: string;
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

export function isValidApiKeyFormat(apiKey: string): boolean {
  return new RegExp(
    `^${API_KEY_PREFIX}[A-Za-z0-9_-]{${RANDOM_KEY_LENGTH}}$`,
  ).test(apiKey);
}

export function generateApiKey(): GeneratedApiKey {
  const plaintext = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, API_KEY_PREFIX.length + 8),
    hash: hashApiKey(plaintext),
  };
}
