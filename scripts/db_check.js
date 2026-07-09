const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'data', 'highscores.db'));
const b = db.prepare('SELECT COUNT(*) as c FROM bosses').get();
const p = db.prepare('SELECT COUNT(*) as c FROM personal_bests').get();
console.log('bosses:', b.c, 'personal_bests:', p.c);
