/**
 * lib/db.ts
 * -----------------------------------------------------------------------
 * Simpele database-laag voor de PB highscores website.
 *
 * We gebruiken SQLite via "better-sqlite3":
 *  - Geen aparte database server nodig (goed voor lokaal draaien / MVP).
 *  - De data staat in één bestand: data/highscores.db
 *  - Synchrone API, wat de code hier eenvoudig en overzichtelijk houdt.
 *
 * Later uitbreidbaar:
 *  - Wil je naar Postgres/MySQL/PlanetScale/Supabase? Dan vervang je
 *    alleen dit bestand (de rest van de app praat via de functies
 *    hieronder, niet direct met SQL), of je stapt over op een ORM
 *    zoals Prisma/Drizzle die met dezelfde functie-signatures werkt.
 * -----------------------------------------------------------------------
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { PersonalBest } from "@/types/pb";
import { BOSSES } from "@/lib/bosses";
import { validateRsn } from "@/lib/rsn";
import { normalizeRsn } from "@/lib/rsn";
import { generateApiKey } from "@/lib/apiKeyCrypto";
import {
  generateVerificationCode,
  hashVerificationCode,
  isValidVerificationCodeFormat,
} from "@/lib/verificationCode";
import { normalizeRuneLiteAccountHash } from "@/lib/runeliteAccountHash";

export const MAX_PB_DURATION_MS = 86_400_000;

// Zorg dat de map "data/" bestaat voordat we het db-bestand aanmaken.
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "highscores.db");

// In development herlaadt Next.js modules regelmatig. Door de database-
// connectie op de "global" te bewaren voorkomen we dat we per reload een
// nieuwe connectie naar hetzelfde bestand openen.
const globalForDb = global as unknown as { db?: Database.Database };

const db = globalForDb.db ?? new Database(DB_PATH);
if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

// Iets betere prestaties/gedrag voor een lokale SQLite-file.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// CREATE TABLES
db.exec(`
  CREATE TABLE IF NOT EXISTS bosses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    min_time_millis INTEGER NULL,
    max_time_millis INTEGER NULL,
    is_active INTEGER NOT NULL DEFAULT 0
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS personal_bests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    boss_id INTEGER NOT NULL,
    time_millis INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'plugin',
    screenshot_url TEXT NULL,
    game_message TEXT NULL,
    submitted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (boss_id) REFERENCES bosses(id),
    UNIQUE(player_name, boss_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS pb_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT,
    boss_id INTEGER,
    time_millis INTEGER,
    source TEXT NOT NULL DEFAULT 'plugin',
    game_message TEXT NULL,
    screenshot_url TEXT NULL,
    plugin_version TEXT NULL,
    ip_address TEXT NULL,
    accepted INTEGER NOT NULL DEFAULT 0,
    rejection_reason TEXT NULL,
    submitted_at TEXT NOT NULL,
    FOREIGN KEY (boss_id) REFERENCES bosses(id)
  );
`);

// CREATE INDEXES
db.exec(`CREATE INDEX IF NOT EXISTS idx_personal_bests_boss_time ON personal_bests (boss_id, time_millis ASC);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_personal_bests_player ON personal_bests (player_name);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pb_submissions_player_submitted ON pb_submissions (player_name, submitted_at DESC);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pb_submissions_boss_submitted ON pb_submissions (boss_id, submitted_at DESC);`);

// HELPER FUNCTIONS (define BEFORE calling)
function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function seedBossesIfEmpty() {
  const row = db.prepare("SELECT COUNT(*) as count FROM bosses").get() as { count: number };
  if (row.count > 0) return;

  const insert = db.prepare(`INSERT INTO bosses (slug, name, is_active) VALUES (?, ?, ?)`);
  const insertMany = db.transaction((names: string[]) => {
    for (const name of names) {
      insert.run(slugify(name), name, 1);
    }
  });

  insertMany(BOSSES as unknown as string[]);
}

// RUN INITIALIZATION
// seedBossesIfEmpty();

// Helper to map DB rows to PersonalBest type used by frontend
interface PersonalBestRow {
  id: number;
  player_name: string;
  boss_id: number;
  boss_name: string;
  time_millis: number;
  submitted_at: string;
  updated_at: string;
}

function rowToPersonalBest(row: PersonalBestRow): PersonalBest {
  return {
    id: row.id,
    playerName: row.player_name,
    boss: row.boss_name,
    timeMillis: row.time_millis,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

// Public helpers
export function getBosses() {
  return db.prepare(`SELECT id, slug, name, is_active FROM bosses WHERE is_active = 1 ORDER BY name ASC`).all() as Array<{
    id: number;
    slug: string;
    name: string;
    is_active: number;
  }>;
}

export function getLatestSubmissions(limit = 10) {
  return db.prepare(`
    SELECT
      submission.id,
      account.rsn AS player_name,
      boss.name AS boss_name,
      submission.duration_ms AS time_millis,
      submission.accepted,
      submission.submitted_at
    FROM pb_submissions submission
    JOIN game_accounts account ON account.id = submission.game_account_id
    JOIN bosses boss ON boss.id = submission.boss_id
    WHERE boss.is_active = 1
    ORDER BY submission.submitted_at DESC, submission.id DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: number;
    player_name: string;
    boss_name: string;
    time_millis: number;
    accepted: number;
    submitted_at: string;
  }>;
}

export function getHighscoresForBossPaginated(bossSlug: string, page = 1, perPage = 25) {
  const boss = db.prepare(`SELECT id, name FROM bosses WHERE slug = ? AND is_active = 1`).get(bossSlug) as { id: number; name: string } | undefined;
  if (!boss) return { data: [], total: 0, bossName: null };

  const offset = (page - 1) * perPage;
  const countRow = db.prepare(`SELECT COUNT(*) as count FROM personal_bests WHERE boss_id = ?`).get(boss.id) as { count: number };

  const rows = db.prepare(`SELECT pb.id, account.rsn AS player_name, pb.best_duration_ms AS time_millis, pb.achieved_at AS submitted_at, pb.updated_at, b.name as boss_name
    FROM personal_bests pb
    JOIN bosses b ON pb.boss_id = b.id
    JOIN game_accounts account ON account.id = pb.game_account_id
    WHERE pb.boss_id = ?
    ORDER BY pb.best_duration_ms ASC
    LIMIT ? OFFSET ?`).all(boss.id, perPage, offset) as PersonalBestRow[];

  return { data: rows.map(rowToPersonalBest), total: countRow.count, bossName: boss.name };
}

export interface DatabaseUser {
  id: number;
  discordId: string;
  discordUsername: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  role: UserRole;
}

export type UserRole = "user" | "admin";

interface UserRow {
  id: number;
  discord_id: string;
  discord_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  role: UserRole;
}

function rowToUser(row: UserRow): DatabaseUser {
  return {
    id: row.id,
    discordId: row.discord_id,
    discordUsername: row.discord_username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    role: row.role,
  };
}

export function upsertDiscordUser(profile: {
  discordId: string;
  discordUsername: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}): DatabaseUser {
  const now = new Date().toISOString();
  const row = db.prepare(`
    INSERT INTO users (
      discord_id, discord_username, display_name, avatar_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      discord_username = excluded.discord_username,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at
    WHERE users.discord_username IS NOT excluded.discord_username
       OR users.display_name IS NOT excluded.display_name
       OR users.avatar_url IS NOT excluded.avatar_url
    RETURNING id, discord_id, discord_username, display_name, avatar_url, created_at, updated_at, role
  `).get(
    profile.discordId,
    profile.discordUsername,
    profile.displayName,
    profile.avatarUrl,
    now,
    now,
  ) as UserRow | undefined;

  if (row) {
    return rowToUser(row);
  }

  const existing = db.prepare(`
    SELECT id, discord_id, discord_username, display_name, avatar_url, created_at, updated_at, role
    FROM users
    WHERE discord_id = ?
  `).get(profile.discordId) as UserRow | undefined;

  if (!existing) {
    throw new Error("Discord user upsert did not return a database user");
  }

  return rowToUser(existing);
}

export function getUserById(id: number): DatabaseUser | undefined {
  const row = db.prepare(`
    SELECT id, discord_id, discord_username, display_name, avatar_url, created_at, updated_at, role
    FROM users
    WHERE id = ?
  `).get(id) as UserRow | undefined;

  return row ? rowToUser(row) : undefined;
}

export interface ApiKeyMetadata {
  id: number;
  gameAccountId: number;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface ApiKeyRow {
  id: number;
  game_account_id: number;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

function rowToApiKeyMetadata(row: ApiKeyRow): ApiKeyMetadata {
  return {
    id: row.id,
    gameAccountId: row.game_account_id,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export function getActiveApiKeysForUser(userId: number): ApiKeyMetadata[] {
  const rows = db.prepare(`
    SELECT key.id, key.game_account_id, key.key_prefix, key.created_at, key.last_used_at
    FROM api_keys key
    JOIN game_accounts account ON account.id = key.game_account_id
    WHERE account.user_id = ?
      AND account.verified_at IS NOT NULL
      AND key.revoked_at IS NULL
    ORDER BY key.created_at DESC, key.id DESC
  `).all(userId) as ApiKeyRow[];

  return rows.map(rowToApiKeyMetadata);
}

export type CreateApiKeyResult =
  | { success: true; apiKey: ApiKeyMetadata; plaintext: string }
  | { success: false; message: string };

function writeApiKeyForGameAccount(
  userId: number,
  gameAccountId: number,
  replace: boolean,
): CreateApiKeyResult {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generated = generateApiKey();
    try {
      const transaction = db.transaction(() => {
        const account = db.prepare(`
          SELECT id
          FROM game_accounts
          WHERE id = ? AND user_id = ? AND verified_at IS NOT NULL
        `).get(gameAccountId, userId) as { id: number } | undefined;
        if (!account) {
          throw new Error("GAME_ACCOUNT_NOT_OWNED");
        }

        const active = db.prepare(`
          SELECT id
          FROM api_keys
          WHERE game_account_id = ? AND revoked_at IS NULL
        `).get(gameAccountId) as { id: number } | undefined;
        if (active && !replace) {
          throw new Error("ACTIVE_SECRET_EXISTS");
        }
        if (active) {
          db.prepare(`
            UPDATE api_keys
            SET revoked_at = ?
            WHERE id = ? AND revoked_at IS NULL
          `).run(new Date().toISOString(), active.id);
        }

        return db.prepare(`
          INSERT INTO api_keys (
            game_account_id, key_prefix, key_hash, created_at
          ) VALUES (?, ?, ?, ?)
          RETURNING id, game_account_id, key_prefix, created_at, last_used_at
        `).get(
          gameAccountId,
          generated.prefix,
          generated.hash,
          new Date().toISOString(),
        ) as ApiKeyRow;
      });
      const row = transaction();

      return {
        success: true,
        apiKey: rowToApiKeyMetadata(row),
        plaintext: generated.plaintext,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "GAME_ACCOUNT_NOT_OWNED") {
        return {
          success: false,
          message: "RuneScape account not found.",
        };
      }
      if (error instanceof Error && error.message === "ACTIVE_SECRET_EXISTS") {
        return {
          success: false,
          message: "This RuneScape account already has an active secret.",
        };
      }
      if (
        error instanceof Error &&
        error.message.includes("api_keys.key_hash") &&
        attempt < 2
      ) {
        continue;
      }
      console.error("Failed to create API key");
      return {
        success: false,
        message: "The API key could not be created. Please try again.",
      };
    }
  }

  return {
    success: false,
    message: "The API key could not be created. Please try again.",
  };
}

export function createApiKeyForGameAccount(
  userId: number,
  gameAccountId: number,
): CreateApiKeyResult {
  return writeApiKeyForGameAccount(userId, gameAccountId, false);
}

export function replaceApiKeyForGameAccount(
  userId: number,
  gameAccountId: number,
): CreateApiKeyResult {
  return writeApiKeyForGameAccount(userId, gameAccountId, true);
}

export function revokeApiKeyForGameAccount(
  userId: number,
  gameAccountId: number,
): boolean {
  const result = db.prepare(`
    UPDATE api_keys
    SET revoked_at = ?
    WHERE game_account_id = ?
      AND revoked_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM game_accounts account
        WHERE account.id = api_keys.game_account_id
          AND account.user_id = ?
      )
  `).run(new Date().toISOString(), gameAccountId, userId);

  return result.changes === 1;
}

export function authenticateApiKeyHash(
  keyHash: string,
): { apiKeyId: number; userId: number; gameAccountId: number } | undefined {
  const row = db.prepare(`
      SELECT key.id, account.user_id, key.game_account_id
      FROM api_keys key
      JOIN game_accounts account ON account.id = key.game_account_id
      WHERE key.key_hash = ? AND key.revoked_at IS NULL
    `).get(keyHash) as
    | { id: number; user_id: number; game_account_id: number }
    | undefined;
  return row
    ? { apiKeyId: row.id, userId: row.user_id, gameAccountId: row.game_account_id }
    : undefined;
}

export function markApiKeyUsed(apiKeyId: number): void {
  db.prepare(`
    UPDATE api_keys
    SET last_used_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).run(new Date().toISOString(), apiKeyId);
}

export interface AdminBoss {
  id: number;
  slug: string;
  name: string;
  isActive: boolean;
}

export function getAllBosses(): AdminBoss[] {
  const rows = db.prepare(`
    SELECT id, slug, name, is_active
    FROM bosses
    ORDER BY name ASC
  `).all() as Array<{ id: number; slug: string; name: string; is_active: number }>;

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    isActive: row.is_active === 1,
  }));
}

export function setBossActive(id: number, isActive: boolean): boolean {
  const result = db.prepare(`
    UPDATE bosses
    SET is_active = ?
    WHERE id = ?
  `).run(isActive ? 1 : 0, id);

  return result.changes === 1;
}

export type VerificationStatus = "UNVERIFIED" | "VERIFIED" | "REVOKED";

export interface GameAccount {
  id: number;
  userId: number;
  rsn: string;
  normalizedRsn: string;
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
  runeliteAccountHash: string | null;
}

interface GameAccountRow {
  id: number;
  user_id: number;
  rsn: string;
  normalized_rsn: string;
  verification_status: VerificationStatus;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
  runelite_account_hash: string | null;
}

function rowToGameAccount(row: GameAccountRow): GameAccount {
  return {
    id: row.id,
    userId: row.user_id,
    rsn: row.rsn,
    normalizedRsn: row.normalized_rsn,
    verificationStatus: row.verification_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at,
    runeliteAccountHash: row.runelite_account_hash,
  };
}

export function getGameAccountsForUser(userId: number): GameAccount[] {
  const rows = db.prepare(`
    SELECT id, user_id, rsn, normalized_rsn, verification_status, created_at, updated_at,
      verified_at, runelite_account_hash
    FROM game_accounts
    WHERE user_id = ? AND verified_at IS NOT NULL
    ORDER BY created_at ASC, id ASC
  `).all(userId) as GameAccountRow[];

  return rows.map(rowToGameAccount);
}

export type VerificationState =
  | "PENDING"
  | "VERIFIED"
  | "EXPIRED"
  | "CANCELLED";

export interface VerificationAttempt {
  id: number;
  rsn: string;
  expiresAt: string;
  state: VerificationState;
}

interface VerificationRow {
  id: number;
  user_id: number;
  rsn: string;
  normalized_rsn: string;
  code_hash: string;
  expires_at: string;
  used_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

function verificationState(row: VerificationRow): VerificationState {
  if (row.used_at) return "VERIFIED";
  if (row.cancelled_at) return "CANCELLED";
  if (new Date(row.expires_at).getTime() <= Date.now()) return "EXPIRED";
  return "PENDING";
}

function consumeRateLimitUnsafe(
  rateKey: string,
  maximumAttempts: number,
  windowMs: number,
): boolean {
  const now = new Date();
  const existing = db.prepare(`
    SELECT window_started_at, attempt_count
    FROM verification_rate_limits
    WHERE rate_key = ?
  `).get(rateKey) as
    | { window_started_at: string; attempt_count: number }
    | undefined;

  if (
    !existing ||
    now.getTime() - new Date(existing.window_started_at).getTime() >= windowMs
  ) {
    db.prepare(`
      INSERT INTO verification_rate_limits (rate_key, window_started_at, attempt_count)
      VALUES (?, ?, 1)
      ON CONFLICT(rate_key) DO UPDATE SET
        window_started_at = excluded.window_started_at,
        attempt_count = 1
    `).run(rateKey, now.toISOString());
    return true;
  }

  if (existing.attempt_count >= maximumAttempts) return false;
  db.prepare(`
    UPDATE verification_rate_limits
    SET attempt_count = attempt_count + 1
    WHERE rate_key = ?
  `).run(rateKey);
  return true;
}

export function consumeVerificationRateLimit(
  rateKey: string,
  maximumAttempts: number,
  windowMs: number,
): boolean {
  return db.transaction(() =>
    consumeRateLimitUnsafe(rateKey, maximumAttempts, windowMs),
  ).immediate();
}

export type StartVerificationResult =
  | {
      success: true;
      verification: VerificationAttempt & { code: string };
    }
  | {
      success: false;
      error:
        | "INVALID_RSN"
        | "RSN_ALREADY_LINKED"
        | "GAME_ACCOUNT_LIMIT_REACHED"
        | "RATE_LIMITED";
      message: string;
    };

export function startGameAccountVerification(
  userId: number,
  inputRsn: string,
): StartVerificationResult {
  const validation = validateRsn(inputRsn);
  if (!validation.success) {
    return { success: false, error: "INVALID_RSN", message: validation.message };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateVerificationCode();
    try {
      return db.transaction(() => {
        if (!consumeRateLimitUnsafe(`verification-start:${userId}`, 5, 15 * 60_000)) {
          return {
            success: false as const,
            error: "RATE_LIMITED" as const,
            message: "Too many verification attempts. Please try again later.",
          };
        }

        const existingAccount = db.prepare(`
          SELECT user_id, verified_at
          FROM game_accounts
          WHERE normalized_rsn = ?
        `).get(validation.value.normalizedRsn) as
          | { user_id: number; verified_at: string | null }
          | undefined;
        if (
          existingAccount &&
          (existingAccount.user_id !== userId || existingAccount.verified_at)
        ) {
          return {
            success: false as const,
            error: "RSN_ALREADY_LINKED" as const,
            message: "This RuneScape account is already linked.",
          };
        }

        const accountCount = db.prepare(`
          SELECT COUNT(*) AS count
          FROM game_accounts
          WHERE user_id = ? AND verified_at IS NOT NULL
        `).get(userId) as { count: number };
        if (accountCount.count >= 10) {
          return {
            success: false as const,
            error: "GAME_ACCOUNT_LIMIT_REACHED" as const,
            message: "You can link at most 10 RuneScape accounts.",
          };
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
        db.prepare(`
          UPDATE game_account_verifications
          SET cancelled_at = ?, updated_at = ?
          WHERE user_id = ? AND normalized_rsn = ?
            AND used_at IS NULL AND cancelled_at IS NULL
        `).run(
          now.toISOString(),
          now.toISOString(),
          userId,
          validation.value.normalizedRsn,
        );

        const row = db.prepare(`
          INSERT INTO game_account_verifications (
            user_id, rsn, normalized_rsn, code_hash, expires_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `).get(
          userId,
          validation.value.rsn,
          validation.value.normalizedRsn,
          code.hash,
          expiresAt,
          now.toISOString(),
          now.toISOString(),
        ) as { id: number };

        return {
          success: true as const,
          verification: {
            id: row.id,
            rsn: validation.value.rsn,
            code: code.plaintext,
            expiresAt,
            state: "PENDING" as const,
          },
        };
      }).immediate();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("game_account_verifications.code_hash") &&
        attempt < 2
      ) {
        continue;
      }
      console.error("Failed to start game account verification");
      throw error;
    }
  }

  throw new Error("Failed to generate a unique verification code");
}

export function getVerificationForUser(
  userId: number,
  verificationId: number,
): VerificationAttempt | undefined {
  const row = db.prepare(`
    SELECT id, user_id, rsn, normalized_rsn, code_hash, expires_at,
      used_at, cancelled_at, created_at, updated_at
    FROM game_account_verifications
    WHERE id = ? AND user_id = ?
  `).get(verificationId, userId) as VerificationRow | undefined;

  return row
    ? { id: row.id, rsn: row.rsn, expiresAt: row.expires_at, state: verificationState(row) }
    : undefined;
}

export function cancelVerificationForUser(
  userId: number,
  verificationId: number,
): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE game_account_verifications
    SET cancelled_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND used_at IS NULL AND cancelled_at IS NULL
  `).run(now, now, verificationId, userId);
  return result.changes === 1;
}

export type CompleteVerificationResult =
  | { success: true; rsn: string }
  | {
      success: false;
      error:
        | "INVALID_RSN"
        | "INVALID_VERIFICATION_CODE"
        | "VERIFICATION_EXPIRED"
        | "VERIFICATION_ALREADY_USED"
        | "VERIFICATION_CANCELLED"
        | "RSN_VERIFICATION_MISMATCH"
        | "RSN_ALREADY_LINKED"
        | "INVALID_ACCOUNT_HASH"
        | "ACCOUNT_HASH_ALREADY_LINKED"
        | "GAME_ACCOUNT_LIMIT_REACHED";
    };

export function completeGameAccountVerification(
  inputRsn: string,
  inputCode: string,
  inputAccountHash: unknown,
): CompleteVerificationResult {
  const validation = validateRsn(inputRsn);
  if (!validation.success) return { success: false, error: "INVALID_RSN" };
  const accountHash = normalizeRuneLiteAccountHash(inputAccountHash);
  if (!accountHash.success) {
    return { success: false, error: "INVALID_ACCOUNT_HASH" };
  }
  if (!isValidVerificationCodeFormat(inputCode)) {
    return { success: false, error: "INVALID_VERIFICATION_CODE" };
  }

  try {
    return db.transaction(() => {
      const attempt = db.prepare(`
        SELECT id, user_id, rsn, normalized_rsn, code_hash, expires_at,
          used_at, cancelled_at, created_at, updated_at
        FROM game_account_verifications
        WHERE code_hash = ?
      `).get(hashVerificationCode(inputCode)) as VerificationRow | undefined;
      if (!attempt) return { success: false as const, error: "INVALID_VERIFICATION_CODE" as const };
      if (attempt.used_at) return { success: false as const, error: "VERIFICATION_ALREADY_USED" as const };
      if (attempt.cancelled_at) return { success: false as const, error: "VERIFICATION_CANCELLED" as const };
      if (new Date(attempt.expires_at).getTime() <= Date.now()) {
        return { success: false as const, error: "VERIFICATION_EXPIRED" as const };
      }
      if (attempt.normalized_rsn !== validation.value.normalizedRsn) {
        return { success: false as const, error: "RSN_VERIFICATION_MISMATCH" as const };
      }

      const existing = db.prepare(`
        SELECT id, user_id, verified_at
        FROM game_accounts
        WHERE normalized_rsn = ?
      `).get(validation.value.normalizedRsn) as
        | { id: number; user_id: number; verified_at: string | null }
        | undefined;
      if (existing && (existing.user_id !== attempt.user_id || existing.verified_at)) {
        return { success: false as const, error: "RSN_ALREADY_LINKED" as const };
      }

      const hashOwner = db.prepare(`
        SELECT id
        FROM game_accounts
        WHERE runelite_account_hash = ?
      `).get(accountHash.value) as { id: number } | undefined;
      if (hashOwner && hashOwner.id !== existing?.id) {
        return {
          success: false as const,
          error: "ACCOUNT_HASH_ALREADY_LINKED" as const,
        };
      }

      const accountCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM game_accounts
        WHERE user_id = ? AND verified_at IS NOT NULL
      `).get(attempt.user_id) as { count: number };
      if (accountCount.count >= 10) {
        return { success: false as const, error: "GAME_ACCOUNT_LIMIT_REACHED" as const };
      }

      const now = new Date().toISOString();
      if (existing) {
        db.prepare(`
          UPDATE game_accounts
          SET rsn = ?, verification_status = 'VERIFIED', verified_at = ?,
            runelite_account_hash = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND verified_at IS NULL
        `).run(
          validation.value.rsn,
          now,
          accountHash.value,
          now,
          existing.id,
          attempt.user_id,
        );
      } else {
        db.prepare(`
          INSERT INTO game_accounts (
            user_id, rsn, normalized_rsn, verification_status,
            created_at, updated_at, verified_at, runelite_account_hash
          ) VALUES (?, ?, ?, 'VERIFIED', ?, ?, ?, ?)
        `).run(
          attempt.user_id,
          validation.value.rsn,
          validation.value.normalizedRsn,
          now,
          now,
          now,
          accountHash.value,
        );
      }

      db.prepare(`
        UPDATE game_account_verifications
        SET used_at = ?, updated_at = ?
        WHERE id = ? AND used_at IS NULL AND cancelled_at IS NULL
      `).run(now, now, attempt.id);
      db.prepare(`
        UPDATE game_account_verifications
        SET cancelled_at = ?, updated_at = ?
        WHERE normalized_rsn = ? AND id <> ?
          AND used_at IS NULL AND cancelled_at IS NULL
      `).run(now, now, attempt.normalized_rsn, attempt.id);

      return { success: true as const, rsn: validation.value.rsn };
    }).immediate();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("game_accounts.normalized_rsn")
    ) {
      return { success: false, error: "RSN_ALREADY_LINKED" };
    }
    if (
      error instanceof Error &&
      error.message.includes("game_accounts.runelite_account_hash")
    ) {
      return { success: false, error: "ACCOUNT_HASH_ALREADY_LINKED" };
    }
    console.error("Failed to complete game account verification");
    throw error;
  }
}

export function deleteGameAccountForUser(
  userId: number,
  gameAccountId: number,
): boolean {
  const result = db.prepare(`
    DELETE FROM game_accounts
    WHERE id = ? AND user_id = ?
  `).run(gameAccountId, userId);

  return result.changes === 1;
}

export function getGameAccountForUser(
  userId: number,
  gameAccountId: number,
): GameAccount | undefined {
  const row = db.prepare(`
    SELECT id, user_id, rsn, normalized_rsn, verification_status, created_at, updated_at,
      verified_at, runelite_account_hash
    FROM game_accounts
    WHERE id = ? AND user_id = ? AND verified_at IS NOT NULL
  `).get(gameAccountId, userId) as GameAccountRow | undefined;

  return row ? rowToGameAccount(row) : undefined;
}

export interface AccountPersonalBest {
  id: number;
  bossName: string;
  durationMs: number;
  achievedAt: string;
}

export function getPersonalBestsForGameAccount(
  gameAccountId: number,
): AccountPersonalBest[] {
  return db.prepare(`
    SELECT
      best.id,
      boss.name AS bossName,
      best.best_duration_ms AS durationMs,
      best.achieved_at AS achievedAt
    FROM personal_bests best
    JOIN bosses boss ON boss.id = best.boss_id
    WHERE best.game_account_id = ? AND boss.is_active = 1
    ORDER BY boss.name ASC
  `).all(gameAccountId) as AccountPersonalBest[];
}

export interface AccountSubmission {
  id: number;
  bossName: string;
  durationMs: number;
  source: PbSubmissionSource;
  accepted: boolean;
  rejectionReason: string | null;
  becamePersonalBest: boolean;
  submittedAt: string;
}

interface AccountSubmissionRow {
  id: number;
  bossName: string;
  durationMs: number;
  source: PbSubmissionSource;
  accepted: number;
  rejectionReason: string | null;
  becamePersonalBest: number;
  submittedAt: string;
}

export function getSubmissionHistoryForGameAccount(
  gameAccountId: number,
  limit = 25,
): AccountSubmission[] {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const rows = db.prepare(`
    SELECT
      submission.id,
      boss.name AS bossName,
      submission.duration_ms AS durationMs,
      submission.source,
      submission.accepted,
      submission.rejection_reason AS rejectionReason,
      submission.became_personal_best AS becamePersonalBest,
      submission.submitted_at AS submittedAt
    FROM pb_submissions submission
    JOIN bosses boss ON boss.id = submission.boss_id
    WHERE submission.game_account_id = ? AND boss.is_active = 1
    ORDER BY submission.submitted_at DESC, submission.id DESC
    LIMIT ?
  `).all(gameAccountId, safeLimit) as AccountSubmissionRow[];

  return rows.map((row) => ({
    ...row,
    accepted: row.accepted === 1,
    becamePersonalBest: row.becamePersonalBest === 1,
  }));
}

export type PbSubmissionSource = "RUNELITE" | "MANUAL" | "IMPORT" | "ADMIN";
export type PbSubmissionOutcome =
  | "FIRST_PERSONAL_BEST"
  | "NEW_PERSONAL_BEST"
  | "NOT_FASTER"
  | "ALREADY_UPLOADED";

export interface ProcessPbSubmissionResult {
  outcome: PbSubmissionOutcome;
  durationMs: number;
  previousBestMs: number | null;
  currentBestMs: number;
}

interface CurrentBestRow {
  best_duration_ms: number;
}

export function processPbSubmission(input: {
  gameAccountId: number;
  bossId: number;
  durationMs: number;
  source: PbSubmissionSource;
  screenshotUrl?: string | null;
  submittedAt?: string;
}): ProcessPbSubmissionResult {
  const transaction = db.transaction(() => {
    const account = db.prepare("SELECT id FROM game_accounts WHERE id = ?").get(
      input.gameAccountId,
    ) as { id: number } | undefined;
    if (!account) {
      throw new Error("GAME_ACCOUNT_NOT_FOUND");
    }

    const boss = db.prepare("SELECT id, is_active FROM bosses WHERE id = ?").get(
      input.bossId,
    ) as { id: number; is_active: number } | undefined;
    if (!boss) {
      throw new Error("BOSS_NOT_FOUND");
    }
    if (boss.is_active !== 1) {
      throw new Error("BOSS_DISABLED");
    }

    if (
      !Number.isSafeInteger(input.durationMs) ||
      input.durationMs <= 0 ||
      input.durationMs > MAX_PB_DURATION_MS
    ) {
      throw new Error("INVALID_DURATION");
    }

    const submittedAt = input.submittedAt ?? new Date().toISOString();
    const previous = db.prepare(`
      SELECT best_duration_ms
      FROM personal_bests
      WHERE game_account_id = ? AND boss_id = ?
    `).get(input.gameAccountId, input.bossId) as CurrentBestRow | undefined;

    const duplicate = db.prepare(`
      SELECT id
      FROM pb_submissions
      WHERE game_account_id = ?
        AND boss_id = ?
        AND duration_ms = ?
        AND accepted = 1
      LIMIT 1
    `).get(
      input.gameAccountId,
      input.bossId,
      input.durationMs,
    ) as { id: number } | undefined;

    if (duplicate) {
      return {
        outcome: "ALREADY_UPLOADED" as const,
        durationMs: input.durationMs,
        previousBestMs: previous?.best_duration_ms ?? null,
        currentBestMs: previous?.best_duration_ms ?? input.durationMs,
      };
    }

    const submission = db.prepare(`
      INSERT INTO pb_submissions (
        game_account_id, boss_id, duration_ms, source, screenshot_url,
        accepted, submitted_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      RETURNING id
    `).get(
      input.gameAccountId,
      input.bossId,
      input.durationMs,
      input.source,
      input.screenshotUrl ?? null,
      submittedAt,
      new Date().toISOString(),
    ) as { id: number } | undefined;

    if (!submission) {
      return {
        outcome: "ALREADY_UPLOADED" as const,
        durationMs: input.durationMs,
        previousBestMs: previous?.best_duration_ms ?? null,
        currentBestMs: previous?.best_duration_ms ?? input.durationMs,
      };
    }

    const improvesBest = !previous || input.durationMs < previous.best_duration_ms;
    if (improvesBest) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO personal_bests (
          game_account_id, boss_id, best_duration_ms, submission_id,
          achieved_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_account_id, boss_id) DO UPDATE SET
          best_duration_ms = excluded.best_duration_ms,
          submission_id = excluded.submission_id,
          achieved_at = excluded.achieved_at,
          updated_at = excluded.updated_at
        WHERE excluded.best_duration_ms < personal_bests.best_duration_ms
      `).run(
        input.gameAccountId,
        input.bossId,
        input.durationMs,
        submission.id,
        submittedAt,
        now,
        now,
      );
      db.prepare(`
        UPDATE pb_submissions
        SET became_personal_best = 1
        WHERE id = ?
      `).run(submission.id);
    }

    return {
      outcome: !previous
        ? "FIRST_PERSONAL_BEST" as const
        : improvesBest
          ? "NEW_PERSONAL_BEST" as const
          : "NOT_FASTER" as const,
      durationMs: input.durationMs,
      previousBestMs: previous?.best_duration_ms ?? null,
      currentBestMs: improvesBest
        ? input.durationMs
        : previous?.best_duration_ms ?? input.durationMs,
    };
  });

  return transaction();
}

export type ResolvePbSubmissionResult =
  | {
      success: true;
      value: ProcessPbSubmissionResult;
      identity: RuneLiteIdentity;
    }
  | {
      success: false;
      code:
        | "INVALID_RSN"
        | "INVALID_ACCOUNT_HASH"
        | "ACCOUNT_HASH_MISMATCH"
        | "ACCOUNT_HASH_ALREADY_LINKED"
        | "ACCOUNT_REVERIFICATION_REQUIRED"
        | "GAME_ACCOUNT_NOT_LINKED"
        | "RSN_ALREADY_LINKED"
        | "BOSS_NOT_FOUND"
        | "BOSS_DISABLED"
        | "INVALID_DURATION";
      message: string;
    };

export interface RuneLiteIdentity {
  gameAccountId: number;
  rsn: string;
  nameChanged: boolean;
  previousRsn?: string;
}

export type SynchronizeRuneLiteIdentityResult =
  | { success: true; identity: RuneLiteIdentity }
  | {
      success: false;
      code:
        | "INVALID_RSN"
        | "INVALID_ACCOUNT_HASH"
        | "ACCOUNT_HASH_MISMATCH"
        | "ACCOUNT_HASH_ALREADY_LINKED"
        | "ACCOUNT_REVERIFICATION_REQUIRED"
        | "GAME_ACCOUNT_NOT_LINKED"
        | "RSN_ALREADY_LINKED";
      message: string;
    };

export function synchronizeRuneLiteAccountIdentity(input: {
  userId: number;
  gameAccountId: number;
  submittedRsn: string;
  submittedAccountHash: unknown;
}): SynchronizeRuneLiteIdentityResult {
  const rsn = validateRsn(input.submittedRsn);
  if (!rsn.success) {
    return { success: false, code: "INVALID_RSN", message: rsn.message };
  }
  const accountHash = normalizeRuneLiteAccountHash(input.submittedAccountHash);
  if (!accountHash.success) {
    return {
      success: false,
      code: "INVALID_ACCOUNT_HASH",
      message: "A valid RuneLite account hash is required.",
    };
  }

  try {
    return db.transaction(() => {
      const account = db.prepare(`
        SELECT id, user_id, rsn, normalized_rsn, verification_status,
          created_at, updated_at, verified_at, runelite_account_hash
        FROM game_accounts
        WHERE id = ? AND user_id = ? AND verified_at IS NOT NULL
      `).get(input.gameAccountId, input.userId) as GameAccountRow | undefined;
      if (!account) {
        return {
          success: false as const,
          code: "GAME_ACCOUNT_NOT_LINKED" as const,
          message: "The secret is not linked to a verified RuneScape account.",
        };
      }

      if (account.runelite_account_hash === null) {
        if (account.normalized_rsn !== rsn.value.normalizedRsn) {
          return {
            success: false as const,
            code: "ACCOUNT_REVERIFICATION_REQUIRED" as const,
            message: "This legacy account must be reverified before changing its name.",
          };
        }
        const hashOwner = db.prepare(`
          SELECT id FROM game_accounts WHERE runelite_account_hash = ?
        `).get(accountHash.value) as { id: number } | undefined;
        if (hashOwner && hashOwner.id !== account.id) {
          return {
            success: false as const,
            code: "ACCOUNT_HASH_ALREADY_LINKED" as const,
            message: "This RuneLite account is already linked.",
          };
        }
        db.prepare(`
          UPDATE game_accounts
          SET runelite_account_hash = ?, updated_at = ?
          WHERE id = ? AND runelite_account_hash IS NULL
        `).run(accountHash.value, new Date().toISOString(), account.id);
        return {
          success: true as const,
          identity: {
            gameAccountId: account.id,
            rsn: account.rsn,
            nameChanged: false,
          },
        };
      }

      if (account.runelite_account_hash !== accountHash.value) {
        return {
          success: false as const,
          code: "ACCOUNT_HASH_MISMATCH" as const,
          message: "The RuneLite account hash does not match this secret.",
        };
      }

      if (account.normalized_rsn === rsn.value.normalizedRsn) {
        return {
          success: true as const,
          identity: {
            gameAccountId: account.id,
            rsn: account.rsn,
            nameChanged: false,
          },
        };
      }

      const nameOwner = db.prepare(`
        SELECT id FROM game_accounts WHERE normalized_rsn = ?
      `).get(rsn.value.normalizedRsn) as { id: number } | undefined;
      if (nameOwner && nameOwner.id !== account.id) {
        return {
          success: false as const,
          code: "RSN_ALREADY_LINKED" as const,
          message: "The new RuneScape name is already linked.",
        };
      }

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO game_account_name_history (
          game_account_id, previous_rsn, previous_normalized_rsn,
          changed_to_rsn, changed_at, source
        ) VALUES (?, ?, ?, ?, ?, 'RUNELITE_ACCOUNT_HASH_MATCH')
      `).run(
        account.id,
        account.rsn,
        account.normalized_rsn,
        rsn.value.rsn,
        now,
      );
      db.prepare(`
        UPDATE game_accounts
        SET rsn = ?, normalized_rsn = ?, updated_at = ?
        WHERE id = ? AND runelite_account_hash = ?
      `).run(
        rsn.value.rsn,
        rsn.value.normalizedRsn,
        now,
        account.id,
        accountHash.value,
      );

      return {
        success: true as const,
        identity: {
          gameAccountId: account.id,
          rsn: rsn.value.rsn,
          nameChanged: true,
          previousRsn: account.rsn,
        },
      };
    }).immediate();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("game_accounts.runelite_account_hash")
    ) {
      return {
        success: false,
        code: "ACCOUNT_HASH_ALREADY_LINKED",
        message: "This RuneLite account is already linked.",
      };
    }
    if (
      error instanceof Error &&
      error.message.includes("game_accounts.normalized_rsn")
    ) {
      return {
        success: false,
        code: "RSN_ALREADY_LINKED",
        message: "The new RuneScape name is already linked.",
      };
    }
    console.error("Failed to synchronize RuneLite account identity");
    throw error;
  }
}

export function submitPbByRsn(input: {
  userId: number;
  gameAccountId: number;
  rsn: string;
  accountHash: unknown;
  bossIdentifier: string;
  durationMs: number;
  source?: PbSubmissionSource;
  screenshotUrl?: string | null;
}): ResolvePbSubmissionResult {
  const synchronization = synchronizeRuneLiteAccountIdentity({
    userId: input.userId,
    gameAccountId: input.gameAccountId,
    submittedRsn: input.rsn,
    submittedAccountHash: input.accountHash,
  });
  if (!synchronization.success) return synchronization;

  if (
    !Number.isSafeInteger(input.durationMs) ||
    input.durationMs <= 0 ||
    input.durationMs > MAX_PB_DURATION_MS
  ) {
    return {
      success: false,
      code: "INVALID_DURATION",
      message: `Duration must be a whole number between 1 and ${MAX_PB_DURATION_MS} milliseconds.`,
    };
  }

  const bossSlug = slugify(input.bossIdentifier);
  const boss = db.prepare(`
    SELECT id, is_active
    FROM bosses
    WHERE slug = ?
  `).get(bossSlug) as { id: number; is_active: number } | undefined;
  if (!boss) {
    return {
      success: false,
      code: "BOSS_NOT_FOUND",
      message: `Boss "${input.bossIdentifier}" is not supported.`,
    };
  }
  if (boss.is_active !== 1) {
    return {
      success: false,
      code: "BOSS_DISABLED",
      message: `Uploads for "${input.bossIdentifier}" are currently disabled.`,
    };
  }

  try {
    return {
      success: true,
      identity: synchronization.identity,
      value: processPbSubmission({
        gameAccountId: synchronization.identity.gameAccountId,
        bossId: boss.id,
        durationMs: input.durationMs,
        source: input.source ?? "RUNELITE",
        screenshotUrl: input.screenshotUrl,
      }),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "BOSS_DISABLED") {
      return {
        success: false,
        code: "BOSS_DISABLED",
        message: `Uploads for "${input.bossIdentifier}" are currently disabled.`,
      };
    }
    console.error("Failed to process PB submission");
    throw error;
  }
}
