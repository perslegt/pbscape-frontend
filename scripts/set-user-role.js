const Database = require("better-sqlite3");
const path = require("path");

const [, , discordId, role] = process.argv;
const allowedRoles = new Set(["user", "admin"]);

if (!discordId || !role || !allowedRoles.has(role)) {
  console.error("Usage: node scripts/set-user-role.js <discord-id> <user|admin>");
  process.exitCode = 1;
} else {
  const database = new Database(
    path.join(process.cwd(), "data", "highscores.db"),
  );
  const result = database.prepare(`
    UPDATE users
    SET role = ?, updated_at = ?
    WHERE discord_id = ?
  `).run(role, new Date().toISOString(), discordId);

  database.close();

  if (result.changes !== 1) {
    console.error("No user found for that Discord ID");
    process.exitCode = 1;
  } else {
    console.log(`User role updated to ${role}`);
  }
}
