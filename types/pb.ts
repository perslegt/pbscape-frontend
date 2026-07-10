/**
 * Centrale type-definities voor Personal Bests (PB's).
 *
 * Door alle types op één plek te houden, kunnen zowel de API route,
 * de database-laag als de pagina's dezelfde vorm van data gebruiken.
 */

// Eén personal best zoals opgeslagen in de database / getoond op de website.
export interface PersonalBest {
  id: number;
  playerName: string;
  boss: string; // boss display name
  timeMillis: number;
  submittedAt: string; // ISO-8601 datum string, e.g. "2026-07-09T12:34:56.000Z"
  updatedAt?: string;
}

// De body die de RuneLite plugin naar POST /api/pb-submissions stuurt.
export interface SubmitPBRequest {
  playerName?: string;
  rsn?: string;
  boss?: string;
  bossSlug?: string;
  timeMillis?: number;
  durationMs?: number;
  accountHash?: string;
  gameMessage?: string;
  pluginVersion?: string;
}

// De JSON response die /api/pb-submissions teruggeeft.
export interface SubmitPBResponse {
  success: boolean;
  message: string;
  boss?: string;
  error?:
    | "INVALID_API_KEY"
    | "GAME_ACCOUNT_NOT_LINKED"
    | "INVALID_ACCOUNT_HASH"
    | "ACCOUNT_HASH_MISMATCH"
    | "ACCOUNT_HASH_ALREADY_LINKED"
    | "ACCOUNT_REVERIFICATION_REQUIRED"
    | "RSN_ALREADY_LINKED";
  result?:
    | "FIRST_PERSONAL_BEST"
    | "NEW_PERSONAL_BEST"
    | "NOT_FASTER"
    | "ALREADY_UPLOADED";
  durationMs?: number;
  previousBestMs?: number | null;
  currentBestMs?: number;
  identity?: {
    nameChanged: boolean;
    previousRsn?: string;
    rsn: string;
  };
}

// Bulk sync request: een speler stuurt al zijn PBs in één keer.
export interface SyncPBsRequest {
  playerName: string;
  pbs: Array<{
    boss: string;
    timeMillis: number;
    gameMessage?: string;
  }>;
}

// Response voor bulk sync: statistieken over wat is geupdate.
export interface SyncPBsResponse {
  success: boolean;
  message: string;
  boss?: string;
  stats?: {
    total: number;
    updated: number;
    skipped: number;
    alreadyUploaded?: number;
  };
  identity?: {
    nameChanged: boolean;
    previousRsn?: string;
    rsn: string;
  };
}
