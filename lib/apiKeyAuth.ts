import "server-only";

import { authenticateApiKeyHash } from "@/lib/db";
import { hashApiKey, isValidApiKeyFormat } from "@/lib/apiKeyCrypto";

export type ApiKeyAuthenticationResult =
  | { success: true; userId: number; gameAccountId: number }
  | { success: false };

export function authenticateApiKey(
  authorizationHeader: string | null,
): ApiKeyAuthenticationResult {
  if (!authorizationHeader) {
    return { success: false };
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader);
  const plaintext = match?.[1];
  if (!plaintext || !isValidApiKeyFormat(plaintext)) {
    return { success: false };
  }

  const authenticated = authenticateApiKeyHash(hashApiKey(plaintext));
  return authenticated
    ? {
        success: true,
        userId: authenticated.userId,
        gameAccountId: authenticated.gameAccountId,
      }
    : { success: false };
}
