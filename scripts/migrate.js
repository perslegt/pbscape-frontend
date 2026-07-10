const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const databasePath = path.join(process.cwd(), "data", "highscores.db");
const migrationsPath = path.join(process.cwd(), "migrations");
const database = new Database(databasePath);

database.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

const applied = database.prepare("SELECT 1 FROM migrations WHERE name = ?");
const record = database.prepare(
  "INSERT INTO migrations (name, applied_at) VALUES (?, ?)",
);

const applyMigration = database.transaction((name, sql) => {
  database.exec(sql);
  record.run(name, new Date().toISOString());
});

const migrationFiles = fs
  .readdirSync(migrationsPath)
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const file of migrationFiles) {
  if (applied.get(file)) {
    console.log(`Already applied: ${file}`);
    continue;
  }

  const sql = fs.readFileSync(path.join(migrationsPath, file), "utf8");
  applyMigration(file, sql);
  console.log(`Applied: ${file}`);
}

database.close();
