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

/**
 * Tabel-structuur voor personal bests.
 * We slaan speler + boss altijd op in combinatie met de snelste tijd.
 * De unieke index (case-insensitive) zorgt ervoor dat er nooit meerdere
 * rijen voor dezelfde speler/boss combinatie kunnen bestaan.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS personal_bests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT NOT NULL,
    boss TEXT NOT NULL,
    time_millis INTEGER NOT NULL,
    submitted_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_bests_player_boss
  ON personal_bests (LOWER(player), LOWER(boss));
`);

// -----------------------------------------------------------------------
// Testdata: zorgt dat de homepage en highscores pagina meteen iets tonen
// wanneer je het project voor het eerst lokaal opstart.
// -----------------------------------------------------------------------
function seedTestDataIfEmpty() {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM personal_bests")
    .get() as { count: number };

  if (row.count > 0) return; // Er staat al data in, niet opnieuw seeden.

  const insert = db.prepare(`
    INSERT INTO personal_bests (player, boss, time_millis, submitted_at)
    VALUES (@player, @boss, @timeMillis, @submittedAt)
  `);

  // Wat willekeurige, realistische testtijden per boss (in ms).
  const testPlayers = ["Zezima", "Woox", "Framed", "B0aty", "Torvesta"];

  const now = Date.now();
  let minutesAgo = 0;

  const seedRows: {
    player: string;
    boss: string;
    timeMillis: number;
    submittedAt: string;
  }[] = [];

  BOSSES.forEach((boss, bossIndex) => {
    testPlayers.forEach((player, playerIndex) => {
      // Simpele variatie in tijd per speler/boss, zodat de ranking niet
      // voor elke boss identiek is.
      const baseSeconds = 40 + bossIndex * 15 + playerIndex * 6;
      const timeMillis = baseSeconds * 1000 + playerIndex * 137;

      minutesAgo += 3;
      const submittedAt = new Date(now - minutesAgo * 60_000).toISOString();

      seedRows.push({ player, boss, timeMillis, submittedAt });
    });
  });

  const insertMany = db.transaction((rows: typeof seedRows) => {
    for (const row of rows) insert.run(row);
  });

  insertMany(seedRows);
}

seedTestDataIfEmpty();

// -----------------------------------------------------------------------
// Helper om een ruwe database-rij (snake_case) om te zetten naar het
// PersonalBest type (camelCase) dat de rest van de app gebruikt.
// -----------------------------------------------------------------------
interface PersonalBestRow {
  id: number;
  player: string;
  boss: string;
  time_millis: number;
  submitted_at: string;
}

function rowToPersonalBest(row: PersonalBestRow): PersonalBest {
  return {
    id: row.id,
    player: row.player,
    boss: row.boss,
    timeMillis: row.time_millis,
    submittedAt: row.submitted_at,
  };
}

/**
 * Haalt de meest recent ingezonden PB's op, ongeacht boss.
 * Gebruikt op de homepage voor de "Latest updates" sectie.
 */
export function getLatestPBs(limit = 10): PersonalBest[] {
  const rows = db
    .prepare(
      `SELECT * FROM personal_bests ORDER BY submitted_at DESC LIMIT ?`
    )
    .all(limit) as PersonalBestRow[];

  return rows.map(rowToPersonalBest);
}

/**
 * Haalt de ranking voor één specifieke boss op, gesorteerd van
 * snelste naar langzaamste tijd. Gebruikt op de highscores pagina.
 */
export function getHighscoresForBoss(boss: string): PersonalBest[] {
  const rows = db
    .prepare(
      `SELECT * FROM personal_bests WHERE LOWER(boss) = LOWER(?) ORDER BY time_millis ASC`
    )
    .all(boss) as PersonalBestRow[];

  return rows.map(rowToPersonalBest);
}

/**
 * Haalt paginated highscores voor een boss op. Retourneert de data
 * en totale count voor paginatie.
 */
export function getHighscoresForBossPaginated(
  boss: string,
  page: number = 1,
  perPage: number = 25
): { data: PersonalBest[]; total: number } {
  const offset = (page - 1) * perPage;

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM personal_bests WHERE LOWER(boss) = LOWER(?)`)
    .get(boss) as { count: number };

  const rows = db
    .prepare(
      `SELECT * FROM personal_bests WHERE LOWER(boss) = LOWER(?) ORDER BY time_millis ASC LIMIT ? OFFSET ?`
    )
    .all(boss, perPage, offset) as PersonalBestRow[];

  return {
    data: rows.map(rowToPersonalBest),
    total: countRow.count,
  };
}

/**
 * Resultaat van het (proberen te) opslaan van een nieuwe PB.
 */
export interface SubmitPBResult {
  success: boolean;
  message: string;
}

/**
 * Slaat een nieuwe PB op, maar alleen als:
 *  - er nog geen PB bestaat voor deze speler/boss combinatie, of
 *  - de nieuwe tijd sneller is dan de bestaande PB.
 *
 * Speler- en bossnamen worden case-insensitive vergeleken (RuneScape
 * namen zijn niet hoofdlettergevoelig), maar de originele schrijfwijze
 * wordt bewaard/bijgewerkt zodat de site er netjes uitziet.
 */
export function submitPB(
  player: string,
  boss: string,
  timeMillis: number
): SubmitPBResult {
  const existing = db
    .prepare(
      `SELECT * FROM personal_bests WHERE LOWER(player) = LOWER(?) AND LOWER(boss) = LOWER(?)`
    )
    .get(player, boss) as PersonalBestRow | undefined;

  const submittedAt = new Date().toISOString();

  if (!existing) {
    db.prepare(
      `INSERT INTO personal_bests (player, boss, time_millis, submitted_at)
       VALUES (?, ?, ?, ?)`
    ).run(player, boss, timeMillis, submittedAt);

    return { success: true, message: "New PB saved" };
  }

  if (timeMillis < existing.time_millis) {
    db.prepare(
      `UPDATE personal_bests
       SET time_millis = ?, submitted_at = ?, player = ?, boss = ?
       WHERE id = ?`
    ).run(timeMillis, submittedAt, player, boss, existing.id);

    return { success: true, message: "PB improved and saved" };
  }

  return {
    success: false,
    message: "Submitted time is not faster than current PB",
  };
}
