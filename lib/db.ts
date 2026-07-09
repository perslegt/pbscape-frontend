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

// New schema: bosses, personal_bests (current bests), pb_submissions (all incoming)
db.exec(`
  CREATE TABLE IF NOT EXISTS bosses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    min_time_millis INTEGER NULL,
    max_time_millis INTEGER NULL,
    is_active INTEGER NOT NULL DEFAULT 1
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

function personalBestsUsesLegacySchema() {
  const columns = db.prepare(`PRAGMA table_info('personal_bests')`).all() as Array<{ name: string }>;
  const names = columns.map((column) => column.name);
  return names.includes("player") && names.includes("boss") && names.includes("time_millis") && !names.includes("boss_id");
}

function createOrMigratePersonalBestsTable() {
  const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='personal_bests'`).get();
  if (!tableExists) {
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
    return;
  }

  if (!personalBestsUsesLegacySchema()) {
    return;
  }

  const legacyRows = db.prepare(`SELECT player, boss, time_millis, submitted_at FROM personal_bests`).all() as Array<{ player: string; boss: string; time_millis: number; submitted_at: string }>;

  db.transaction(() => {
    db.exec(`ALTER TABLE personal_bests RENAME TO personal_bests_legacy;`);
    db.exec(`
      CREATE TABLE personal_bests (
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

    const findBoss = db.prepare(`SELECT id FROM bosses WHERE slug = ?`);
    const insertBoss = db.prepare(`INSERT INTO bosses (slug, name, is_active) VALUES (?, ?, 1)`);
    const insertPB = db.prepare(`INSERT OR IGNORE INTO personal_bests (player_name, boss_id, time_millis, source, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
    const updatePB = db.prepare(`UPDATE personal_bests SET time_millis = ?, updated_at = ? WHERE id = ?`);
    const insertSub = db.prepare(`INSERT INTO pb_submissions (player_name, boss_id, time_millis, source, submitted_at, accepted) VALUES (?, ?, ?, ?, ?, 1)`);

    for (const row of legacyRows) {
      const bossSlug = slugify(row.boss || "");
      let boss = findBoss.get(bossSlug) as { id: number } | undefined;
      if (!boss) {
        const result = insertBoss.run(bossSlug, row.boss || bossSlug);
        boss = { id: Number(result.lastInsertRowid) };
      }

      const submittedAt = row.submitted_at || new Date().toISOString();
      const updatedAt = submittedAt;

      insertSub.run(row.player, boss.id, row.time_millis, "legacy", submittedAt);

      const existing = db.prepare(`SELECT id, time_millis FROM personal_bests WHERE player_name = ? AND boss_id = ?`).get(row.player, boss.id) as { id: number; time_millis: number } | undefined;
      if (!existing) {
        insertPB.run(row.player, boss.id, row.time_millis, "legacy", submittedAt, updatedAt);
      } else if (row.time_millis < existing.time_millis) {
        updatePB.run(row.time_millis, updatedAt, existing.id);
      }
    }
  })();
}

seedBossesIfEmpty();
createOrMigratePersonalBestsTable();

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_personal_bests_boss_time ON personal_bests (boss_id, time_millis ASC);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_personal_bests_player ON personal_bests (player_name);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_pb_submissions_player_submitted ON pb_submissions (player_name, submitted_at DESC);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_pb_submissions_boss_submitted ON pb_submissions (boss_id, submitted_at DESC);
`);

// Seed bosses from the static BOSSES array if table empty
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

  const insert = db.prepare(`INSERT INTO bosses (slug, name) VALUES (?, ?)`);
  const insertMany = db.transaction((names: string[]) => {
    for (const name of names) {
      insert.run(slugify(name), name);
    }
  });

  insertMany(BOSSES as unknown as string[]);
}

seedBossesIfEmpty();

// Seed some personal_bests/submissions for local development if empty
function seedTestDataIfEmpty() {
  const row = db.prepare("SELECT COUNT(*) as count FROM personal_bests").get() as { count: number };
  if (row.count > 0) return;

  const testPlayers = ["Zezima", "Woox", "Framed", "B0aty", "Torvesta"];
  const now = Date.now();
  let minutesAgo = 0;

  const bossRows = db.prepare("SELECT id, name FROM bosses ORDER BY id LIMIT 8").all() as { id: number; name: string }[];

  const insertSub = db.prepare(`INSERT INTO pb_submissions (player_name, boss_id, time_millis, source, game_message, submitted_at) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertPB = db.prepare(`INSERT INTO personal_bests (player_name, boss_id, time_millis, source, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);

  const insertMany = db.transaction(() => {
    bossRows.forEach((boss, bossIndex) => {
      testPlayers.forEach((playerIndex) => {
        const baseSeconds = 40 + bossIndex * 15 + playerIndex * 6;
        const timeMillis = baseSeconds * 1000 + playerIndex * 137;
        minutesAgo += 3;
        const submittedAt = new Date(now - minutesAgo * 60_000).toISOString();

        insertSub.run(testPlayers[playerIndex], boss.id, timeMillis, 'seed', `Seed PB for ${boss.name}`, submittedAt);
        insertPB.run(testPlayers[playerIndex], boss.id, timeMillis, 'seed', submittedAt, submittedAt);
      });
    });
  });

  insertMany();
}

seedTestDataIfEmpty();

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

export interface SubmitPBResult {
  success: boolean;
  message: string;
}

export function handleSubmission(options: {
  playerName: string;
  bossSlug: string;
  timeMillis: number;
  gameMessage?: string;
  pluginVersion?: string;
  source?: string;
  screenshotUrl?: string | null;
  ipAddress?: string | null;
}): SubmitPBResult {
  const { playerName, bossSlug, timeMillis, gameMessage, pluginVersion, source = "plugin", screenshotUrl = null, ipAddress = null } = options;

  const now = new Date().toISOString();

  // find boss
  const boss = db.prepare(`SELECT id, name, min_time_millis, max_time_millis, is_active FROM bosses WHERE slug = ?`).get(bossSlug) as any;
  if (!boss || boss.is_active !== 1) {
    return { success: false, message: "Unknown or inactive boss" };
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

  // insert submission first
  const insertSub = db.prepare(`INSERT INTO pb_submissions (player_name, boss_id, time_millis, source, game_message, screenshot_url, plugin_version, ip_address, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const res = insertSub.run(playerName, boss.id, timeMillis, source, gameMessage || null, screenshotUrl, pluginVersion || null, ipAddress, now);
  const submissionId = res.lastInsertRowid as number;

  // check existing PB
  const existing = db.prepare(`SELECT * FROM personal_bests WHERE LOWER(player_name) = LOWER(?) AND boss_id = ?`).get(playerName, boss.id) as any;

  if (!existing) {
    // insert new PB
    const insertPB = db.prepare(`INSERT INTO personal_bests (player_name, boss_id, time_millis, source, screenshot_url, game_message, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertPB.run(playerName, boss.id, timeMillis, source, screenshotUrl, gameMessage || null, now, now);
    db.prepare(`UPDATE pb_submissions SET accepted = 1 WHERE id = ?`).run(submissionId);
    return { success: true, message: "New PB saved" };
  }

  if (timeMillis < existing.time_millis) {
    const updatePB = db.prepare(`UPDATE personal_bests SET time_millis = ?, updated_at = ?, source = ?, screenshot_url = ?, game_message = ? WHERE id = ?`);
    updatePB.run(timeMillis, now, source, screenshotUrl, gameMessage || null, existing.id);
    db.prepare(`UPDATE pb_submissions SET accepted = 1 WHERE id = ?`).run(submissionId);
    return { success: true, message: "PB updated" };
  }

  // not faster
  db.prepare(`UPDATE pb_submissions SET accepted = 0, rejection_reason = ? WHERE id = ?`).run("Submitted time is not faster than current PB", submissionId);
  return { success: false, message: "Submitted time is not faster than current PB" };
}
