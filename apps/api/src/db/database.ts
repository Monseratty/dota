import Database from "better-sqlite3";
import type { AppConfig } from "../config/appConfig";

export type Db = Database.Database;

export function openDatabase(config: AppConfig): Db {
  const db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT UNIQUE,
      source_filename TEXT NOT NULL,
      raw_file_path TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      duration INTEGER,
      radiant_score INTEGER,
      dire_score INTEGER,
      winner TEXT,
      status TEXT NOT NULL,
      discovered_at TEXT NOT NULL,
      queued_at TEXT,
      parsed_at TEXT,
      error_message TEXT,
      raw_deleted_at TEXT,
      raw_delete_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS parse_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      raw_file_path TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      error_message TEXT,
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      steam_id TEXT,
      account_id INTEGER,
      display_name TEXT,
      pro_name TEXT,
      hero_id INTEGER,
      hero_name TEXT,
      team INTEGER,
      slot INTEGER,
      kills INTEGER,
      deaths INTEGER,
      assists INTEGER,
      gpm INTEGER,
      xpm INTEGER,
      net_worth INTEGER,
      hero_damage INTEGER,
      tower_damage INTEGER,
      healing INTEGER,
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      player_id INTEGER,
      item_id INTEGER,
      item_name TEXT,
      slot_type TEXT,
      slot_index INTEGER,
      is_final INTEGER NOT NULL DEFAULT 0,
      purchase_time INTEGER,
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_abilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      player_id INTEGER,
      ability_id INTEGER,
      ability_name TEXT,
      level INTEGER,
      game_time INTEGER,
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
    CREATE INDEX IF NOT EXISTS idx_parse_jobs_status ON parse_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_players_match_id ON players(match_id);
    CREATE INDEX IF NOT EXISTS idx_players_hero_name ON players(hero_name);
    CREATE INDEX IF NOT EXISTS idx_player_items_player_id ON player_items(player_id);
    CREATE INDEX IF NOT EXISTS idx_player_abilities_player_id ON player_abilities(player_id);
  `);

  ensureColumn(db, "matches", "raw_storage_driver", "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn(db, "matches", "raw_storage_key", "TEXT");
  ensureColumn(db, "matches", "raw_uploaded_at", "TEXT");
  ensureColumn(db, "matches", "raw_upload_error", "TEXT");
}

function ensureColumn(db: Db, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((row) => row.name === column)) {
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
