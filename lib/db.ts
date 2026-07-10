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
}

interface GameAccountRow {
  id: number;
  user_id: number;
  rsn: string;
  normalized_rsn: string;
  verification_status: VerificationStatus;
  created_at: string;
  updated_at: string;
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
  };
}

export function getGameAccountsForUser(userId: number): GameAccount[] {
  const rows = db.prepare(`
    SELECT id, user_id, rsn, normalized_rsn, verification_status, created_at, updated_at
    FROM game_accounts
    WHERE user_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(userId) as GameAccountRow[];

  return rows.map(rowToGameAccount);
}

export type CreateGameAccountResult =
  | { success: true; account: GameAccount }
  | { success: false; message: string };

export function createGameAccountForUser(
  userId: number,
  input: string,
): CreateGameAccountResult {
  const validation = validateRsn(input);
  if (!validation.success) {
    return validation;
  }

  const accountCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM game_accounts
    WHERE user_id = ?
  `).get(userId) as { count: number };

  if (accountCount.count >= 10) {
    return {
      success: false,
      message: "You can link at most 10 RuneScape accounts.",
    };
  }

  const now = new Date().toISOString();

  try {
    const row = db.prepare(`
      INSERT INTO game_accounts (
        user_id, rsn, normalized_rsn, verification_status, created_at, updated_at
      ) VALUES (?, ?, ?, 'UNVERIFIED', ?, ?)
      RETURNING id, user_id, rsn, normalized_rsn, verification_status, created_at, updated_at
    `).get(
      userId,
      validation.value.rsn,
      validation.value.normalizedRsn,
      now,
      now,
    ) as GameAccountRow;

    return { success: true, account: rowToGameAccount(row) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("game_account_limit")) {
      return {
        success: false,
        message: "You can link at most 10 RuneScape accounts.",
      };
    }

    if (
      error instanceof Error &&
      error.message.includes("game_accounts.normalized_rsn")
    ) {
      return {
        success: false,
        message: "This RuneScape account is already linked.",
      };
    }

    console.error("Failed to create RuneScape account");
    return {
      success: false,
      message: "The RuneScape account could not be linked. Please try again.",
    };
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
    SELECT id, user_id, rsn, normalized_rsn, verification_status, created_at, updated_at
    FROM game_accounts
    WHERE id = ? AND user_id = ?
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
  | "NOT_FASTER";

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
    ) as { id: number };

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
  | { success: true; value: ProcessPbSubmissionResult }
  | { success: false; code: "INVALID_RSN" | "ACCOUNT_NOT_FOUND" | "BOSS_NOT_FOUND" | "BOSS_DISABLED" | "INVALID_DURATION"; message: string };

export function submitPbByRsn(input: {
  rsn: string;
  bossIdentifier: string;
  durationMs: number;
  source?: PbSubmissionSource;
  screenshotUrl?: string | null;
}): ResolvePbSubmissionResult {
  const rsnValidation = validateRsn(input.rsn);
  if (!rsnValidation.success) {
    return { success: false, code: "INVALID_RSN", message: rsnValidation.message };
  }

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

  const account = db.prepare(`
    SELECT id
    FROM game_accounts
    WHERE normalized_rsn = ?
  `).get(normalizeRsn(input.rsn).normalizedRsn) as { id: number } | undefined;
  if (!account) {
    return { success: false, code: "ACCOUNT_NOT_FOUND", message: "Linked RuneScape account not found." };
  }

  const bossSlug = slugify(input.bossIdentifier);
  const boss = db.prepare(`
    SELECT id, is_active
    FROM bosses
    WHERE slug = ?
  `).get(bossSlug) as { id: number; is_active: number } | undefined;
  if (!boss) {
    return { success: false, code: "BOSS_NOT_FOUND", message: "Boss not found." };
  }
  if (boss.is_active !== 1) {
    return { success: false, code: "BOSS_DISABLED", message: "Submissions for this boss are disabled." };
  }

  try {
    return {
      success: true,
      value: processPbSubmission({
        gameAccountId: account.id,
        bossId: boss.id,
        durationMs: input.durationMs,
        source: input.source ?? "RUNELITE",
        screenshotUrl: input.screenshotUrl,
      }),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "BOSS_DISABLED") {
      return { success: false, code: "BOSS_DISABLED", message: "Submissions for this boss are disabled." };
    }
    console.error("Failed to process PB submission");
    throw error;
  }
}
