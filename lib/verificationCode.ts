import "server-only";

import { createHash, randomBytes } from "crypto";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function normalizeVerificationCode(code: string): string {
  return code.trim().toUpperCase();
}

export function hashVerificationCode(code: string): string {
  return createHash("sha256")
    .update(normalizeVerificationCode(code), "utf8")
    .digest("hex");
}

export function generateVerificationCode(): { plaintext: string; hash: string } {
  const bytes = randomBytes(8);
  let randomPart = "";
  for (const byte of bytes) {
    randomPart += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  const plaintext = `PB-${randomPart.slice(0, 4)}-${randomPart.slice(4)}`;
  return { plaintext, hash: hashVerificationCode(plaintext) };
}

export function isValidVerificationCodeFormat(code: string): boolean {
  return /^PB-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/.test(
    normalizeVerificationCode(code),
  );
}

export function hashRateLimitIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier, "utf8").digest("hex");
}
