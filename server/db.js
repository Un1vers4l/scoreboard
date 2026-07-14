import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(process.env.SCOREBOARD_DB || path.join(__dirname, "scoreboard.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    rules TEXT NOT NULL,
    builtin INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rules TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS game_players (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    seat INTEGER NOT NULL,
    PRIMARY KEY (game_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS scores (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    player_id INTEGER NOT NULL REFERENCES players(id),
    value INTEGER NOT NULL,
    PRIMARY KEY (game_id, round, player_id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    used_by INTEGER REFERENCES users(id),
    used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
`);

// Migration for databases created before the is_admin column existed.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes("is_admin")) {
  db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
}

// If accounts exist but none is admin (pre-admin databases), the first account becomes admin.
db.exec(`
  UPDATE users SET is_admin = 1
  WHERE id = (SELECT MIN(id) FROM users)
    AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = 1)
`);

const BUILTIN_TEMPLATES = [
  {
    name: "Tutto",
    rules: { endCondition: "targetScore", targetScore: 6000, winner: "highest", scoring: "single" },
  },
  {
    name: "Skyjo",
    rules: { endCondition: "targetScore", targetScore: 100, winner: "lowest", scoring: "rounds" },
  },
  {
    name: "Flip 7",
    rules: { endCondition: "targetScore", targetScore: 200, winner: "highest", scoring: "rounds" },
  },
];

// Upsert so rule changes to built-ins reach existing databases.
const insertTemplate = db.prepare(
  `INSERT INTO templates (name, rules, builtin) VALUES (?, ?, 1)
   ON CONFLICT(name) DO UPDATE SET rules = excluded.rules WHERE templates.builtin = 1`
);
for (const t of BUILTIN_TEMPLATES) {
  insertTemplate.run(t.name, JSON.stringify(t.rules));
}

export default db;
