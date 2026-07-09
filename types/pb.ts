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

// De body die de RuneLite plugin naar POST /api/pb stuurt.
export interface SubmitPBRequest {
  playerName: string;
  boss: string; // display name or slug
  timeMillis: number;
  gameMessage?: string;
  pluginVersion?: string;
  apiKey?: string;
}

// De JSON response die /api/pb teruggeeft.
export interface SubmitPBResponse {
  success: boolean;
  message: string;
}

// Bulk sync request: een speler stuurt al zijn PBs in één keer.
export interface SyncPBsRequest {
  playerName: string;
  apiKey?: string;
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
  stats?: {
    total: number;
    updated: number;
    skipped: number;
  };
}
