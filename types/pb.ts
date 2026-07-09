/**
 * Centrale type-definities voor Personal Bests (PB's).
 *
 * Door alle types op één plek te houden, kunnen zowel de API route,
 * de database-laag als de pagina's dezelfde vorm van data gebruiken.
 */

// Eén personal best zoals opgeslagen in de database / getoond op de website.
export interface PersonalBest {
  id: number;
  player: string;
  boss: string;
  timeMillis: number;
  submittedAt: string; // ISO-8601 datum string, bv. "2026-07-09T12:34:56.000Z"
}

// De body die de RuneLite plugin naar POST /api/pb stuurt.
export interface SubmitPBRequest {
  player: string;
  boss: string;
  timeMillis: number;
  apiKey: string;
}

// De JSON response die /api/pb teruggeeft.
export interface SubmitPBResponse {
  success: boolean;
  message: string;
}
