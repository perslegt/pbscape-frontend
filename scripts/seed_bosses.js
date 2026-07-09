const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'data', 'highscores.db'));

const bosses = [
  "Alchemical Hydra",
  "Amoxliatl",
  "Araxxor",
  "Corrupted Gauntlet",
  "Doom of Mokhaïotl",
  "Duke Sucellus",
  "Sol Heredit",
  "The Gauntlet",
  "Grotesque Guardians",
  "Hespori",
  "TzKal-Zuk",
  "The Leviathan",
  "Maggot King",
  "Phosanis Nightmare",
  "Phantom Muspah",
  "Royal Titans",
  "Vardorvis",
  "Vorkath",
  "The Whisperer",
  "Yama",
  "Zulrah",
  "TzTok-Jad",
  "Chambers of Xeric",
  "Chambers of Xeric Challenge Mode",
  "Theatre of Blood",
  "Theatre of Blood Hard Mode",
  "Tombs of Amascut",
  "Tombs of Amascut Expert",
];

const count = db.prepare('SELECT COUNT(*) as c FROM bosses').get().c;
if (count > 0) {
  console.log('bosses already seeded:', count);
  process.exit(0);
}

const insert = db.prepare('INSERT INTO bosses (slug, name) VALUES (?, ?)');
const slugify = (name) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s_-]/g, '').trim().replace(/\s+/g, '_');

const tx = db.transaction((rows) => {
  for (const name of rows) insert.run(slugify(name), name);
});

tx(bosses);
console.log('seeded', bosses.length, 'bosses');
