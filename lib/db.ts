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
  const rows = db.prepare(`SELECT s.id, s.player_name, b.name as boss_name, s.time_millis, s.game_message, s.accepted, s.submitted_at FROM pb_submissions s LEFT JOIN bosses b ON s.boss_id = b.id ORDER BY s.submitted_at DESC LIMIT ?`).all(limit);
  return rows as any[];
}

export function getHighscoresForBossPaginated(bossSlug: string, page = 1, perPage = 25) {
  const boss = db.prepare(`SELECT id, name FROM bosses WHERE slug = ? AND is_active = 1`).get(bossSlug) as { id: number; name: string } | undefined;
  if (!boss) return { data: [], total: 0, bossName: null };

  const offset = (page - 1) * perPage;
  const countRow = db.prepare(`SELECT COUNT(*) as count FROM personal_bests WHERE boss_id = ?`).get(boss.id) as { count: number };

  const rows = db.prepare(`SELECT pb.id, pb.player_name, pb.time_millis, pb.submitted_at, pb.updated_at, b.name as boss_name
    FROM personal_bests pb
    JOIN bosses b ON pb.boss_id = b.id
    WHERE pb.boss_id = ?
    ORDER BY pb.time_millis ASC
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
}

interface UserRow {
  id: number;
  discord_id: string;
  discord_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
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
    RETURNING id, discord_id, discord_username, display_name, avatar_url, created_at, updated_at
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
    SELECT id, discord_id, discord_username, display_name, avatar_url, created_at, updated_at
    FROM users
    WHERE discord_id = ?
  `).get(profile.discordId) as UserRow | undefined;

  if (!existing) {
    throw new Error("Discord user upsert did not return a database user");
  }

  return rowToUser(existing);
}

export interface SubmitPBResult {
  success: boolean;
  message: string;
}

export function handleSubmission(options: {
  playerName: string;
  bossSlug: string;
  bossName?: string;
  timeMillis: number;
  gameMessage?: string;
  pluginVersion?: string;
  source?: string;
  screenshotUrl?: string | null;
  ipAddress?: string | null;
}): SubmitPBResult {
  const { playerName, bossSlug, bossName, timeMillis, gameMessage, pluginVersion, source = "plugin", screenshotUrl = null, ipAddress = null } = options;
  const now = new Date().toISOString();

  // Find or create boss
  let boss = db.prepare(`SELECT id, name, min_time_millis, max_time_millis, is_active FROM bosses WHERE slug = ?`).get(bossSlug) as any;
  if (!boss) {
    const insertBoss = db.prepare(`INSERT INTO bosses (slug, name, is_active) VALUES (?, ?, 0)`);
    const insertResult = insertBoss.run(bossSlug, bossName || bossSlug);
    boss = { id: Number(insertResult.lastInsertRowid), name: bossName || bossSlug, min_time_millis: null, max_time_millis: null, is_active: 0 };
  }

  if (!Number.isFinite(timeMillis) || timeMillis <= 0) {
    return { success: false, message: "'timeMillis' must be a positive number" };
  }

  if (boss.min_time_millis !== null && boss.min_time_millis !== undefined && timeMillis < boss.min_time_millis) {
    return { success: false, message: "Submitted time below allowed minimum" };
  }

  if (boss.max_time_millis !== null && boss.max_time_millis !== undefined && timeMillis > boss.max_time_millis) {
    return { success: false, message: "Submitted time above allowed maximum" };
  }

  // Insert submission first
  const insertSub = db.prepare(`INSERT INTO pb_submissions (player_name, boss_id, time_millis, source, game_message, screenshot_url, plugin_version, ip_address, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertSub.run(playerName, boss.id, timeMillis, source, gameMessage || null, screenshotUrl, pluginVersion || null, ipAddress, now);

  // Check existing PB
  const existing = db.prepare(`SELECT * FROM personal_bests WHERE player_name = ? AND boss_id = ?`).get(playerName, boss.id) as any;

  if (!existing) {
    db.prepare(`INSERT INTO personal_bests (player_name, boss_id, time_millis, source, screenshot_url, game_message, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(playerName, boss.id, timeMillis, source, screenshotUrl, gameMessage || null, now, now);
    return { success: true, message: "New PB saved" };
  }

  if (timeMillis < existing.time_millis) {
    db.prepare(`UPDATE personal_bests SET time_millis = ?, updated_at = ?, source = ?, screenshot_url = ?, game_message = ? WHERE id = ?`).run(timeMillis, now, source, screenshotUrl, gameMessage || null, existing.id);
    return { success: true, message: "PB updated" };
  }

  return { success: false, message: "Submitted time is not faster than current PB" };
}
