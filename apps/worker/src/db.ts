import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "./config";

export type Db = Database.Database;

export interface QueuedJob {
  id: number;
  matchId: number;
  rawFilePath: string;
  rawStorageDriver: string | null;
  rawStorageKey: string | null;
  attempts: number;
}

export function openDatabase(config: AppConfig): Db {
  const db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function getNextQueuedJob(db: Db): QueuedJob | null {
  const row = db.prepare(`
    SELECT
      parse_jobs.id,
      parse_jobs.match_id AS matchId,
      parse_jobs.raw_file_path AS rawFilePath,
      matches.raw_storage_driver AS rawStorageDriver,
      matches.raw_storage_key AS rawStorageKey,
      parse_jobs.attempts
    FROM parse_jobs
    JOIN matches ON matches.id = parse_jobs.match_id
    WHERE parse_jobs.status = 'queued'
    ORDER BY parse_jobs.id ASC
    LIMIT 1
  `).get() as QueuedJob | undefined;

  return row || null;
}

export function resetInterruptedRunningJobs(db: Db): number {
  const now = new Date().toISOString();
  const rows = db.prepare(`
    SELECT id, match_id AS matchId
    FROM parse_jobs
    WHERE status = 'running'
  `).all() as Array<{ id: number; matchId: number }>;

  if (rows.length === 0) {
    return 0;
  }

  const resetJobs = db.transaction(() => {
    const resetJob = db.prepare(`
      UPDATE parse_jobs
      SET status = 'queued', started_at = NULL, error_message = NULL
      WHERE id = ?
    `);
    const resetMatch = db.prepare(`
      UPDATE matches
      SET status = 'queued', error_message = NULL, updated_at = ?
      WHERE id = ?
    `);

    for (const row of rows) {
      resetJob.run(row.id);
      resetMatch.run(now, row.matchId);
    }
  });

  resetJobs();
  return rows.length;
}

function migrate(db: Db): void {
  const matchTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'matches'").get();
  if (!matchTable) {
    return;
  }

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

export function markJobRunning(db: Db, job: QueuedJob): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE parse_jobs
    SET status = 'running', attempts = attempts + 1, started_at = ?, error_message = NULL
    WHERE id = ?
  `).run(now, job.id);
  db.prepare(`
    UPDATE matches
    SET status = 'parsing', updated_at = ?
    WHERE id = ?
  `).run(now, job.matchId);
}

export function markJobDone(db: Db, job: QueuedJob, parsed: ParsedMatchMetadata): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE parse_jobs
    SET status = 'done', finished_at = ?, error_message = NULL
    WHERE id = ?
  `).run(now, job.id);
  db.prepare(`
    UPDATE matches
    SET
      match_id = ?,
      duration = ?,
      radiant_score = ?,
      dire_score = ?,
      winner = ?,
      status = 'ready',
      parsed_at = ?,
      error_message = NULL,
      updated_at = ?
    WHERE id = ?
  `).run(
    parsed.matchId,
    parsed.duration,
    parsed.radiantScore,
    parsed.direScore,
    parsed.winner,
    now,
    now,
    job.matchId
  );
}

export function findExistingMatchByParsedId(db: Db, parsedMatchId: string | null, currentMatchDbId: number): { id: number; sourceFilename: string } | null {
  if (!parsedMatchId) {
    return null;
  }

  const row = db.prepare(`
    SELECT id, source_filename AS sourceFilename
    FROM matches
    WHERE match_id = ?
      AND id != ?
      AND status != 'deleted'
    LIMIT 1
  `).get(parsedMatchId, currentMatchDbId) as { id: number; sourceFilename: string } | undefined;

  return row || null;
}

export function markJobDuplicate(db: Db, job: QueuedJob, parsedMatchId: string, existingMatchDbId: number): void {
  const now = new Date().toISOString();
  const message = `Duplicate replay for match ${parsedMatchId}; already imported as match row ${existingMatchDbId}`;
  const markDuplicate = db.transaction(() => {
    db.prepare(`
      UPDATE parse_jobs
      SET status = 'done', finished_at = ?, error_message = ?
      WHERE id = ?
    `).run(now, message, job.id);
    db.prepare(`
      UPDATE matches
      SET status = 'deleted', error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(message, now, job.matchId);
  });

  markDuplicate();
}

export function persistDashboardData(db: Db, matchId: number, outputDir: string): void {
  const dashboardPath = path.join(outputDir, "dashboard.json");
  if (!fs.existsSync(dashboardPath)) {
    return;
  }

  const dashboard = JSON.parse(fs.readFileSync(dashboardPath, "utf8"));
  const players = dashboard.players || [];
  const finalInventory = dashboard.finalInventory || [];
  const itemBuilds = dashboard.itemBuilds || {};
  const abilityBuilds = dashboard.abilityBuilds || {};

  const replaceData = db.transaction(() => {
    db.prepare("DELETE FROM player_abilities WHERE match_id = ?").run(matchId);
    db.prepare("DELETE FROM player_items WHERE match_id = ?").run(matchId);
    db.prepare("DELETE FROM players WHERE match_id = ?").run(matchId);

    const insertPlayer = db.prepare(`
      INSERT INTO players (
        match_id,
        steam_id,
        account_id,
        display_name,
        pro_name,
        hero_name,
        team,
        slot,
        kills,
        deaths,
        assists,
        net_worth
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItem = db.prepare(`
      INSERT INTO player_items (
        match_id,
        player_id,
        item_name,
        slot_type,
        slot_index,
        is_final,
        purchase_time
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAbility = db.prepare(`
      INSERT INTO player_abilities (
        match_id,
        player_id,
        ability_name,
        level,
        game_time
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    const playerIdsByHero = new Map<string, number>();

    for (const player of players) {
      const result = insertPlayer.run(
        matchId,
        nullable(player.steamId),
        nullable(player.accountId),
        nullable(player.displayName),
        player.isPro ? nullable(player.displayName) : null,
        nullable(player.heroName),
        nullable(player.team),
        nullable(player.index),
        nullable(player.kills),
        nullable(player.deaths),
        nullable(player.assists),
        nullable(player.netWorth ?? player.gold)
      );
      playerIdsByHero.set(String(player.hero || ""), Number(result.lastInsertRowid));
    }

    for (const inventory of finalInventory) {
      const playerId = playerIdsByHero.get(String(inventory.hero || ""));
      if (!playerId) {
        continue;
      }
      insertFinalItems(insertItem, matchId, playerId, "main", inventory.main || []);
      insertFinalItems(insertItem, matchId, playerId, "backpack", inventory.backpack || []);
      insertFinalItems(insertItem, matchId, playerId, "tp", inventory.tp || []);
      insertFinalItems(insertItem, matchId, playerId, "neutral", inventory.neutral || []);
      insertFinalItems(insertItem, matchId, playerId, "enhancement", inventory.enhancement || []);
    }

    for (const [hero, purchases] of Object.entries(itemBuilds)) {
      const playerId = playerIdsByHero.get(hero);
      if (!playerId || !Array.isArray(purchases)) {
        continue;
      }
      for (const item of purchases) {
        insertItem.run(matchId, playerId, nullable(item.name), "purchase", null, 0, nullable(item.time));
      }
    }

    for (const [hero, abilities] of Object.entries(abilityBuilds)) {
      const playerId = playerIdsByHero.get(hero);
      if (!playerId || !Array.isArray(abilities)) {
        continue;
      }
      for (const ability of abilities) {
        insertAbility.run(matchId, playerId, nullable(ability.name), nullable(ability.abilityLevel), nullable(ability.time));
      }
    }
  });

  replaceData();
}

function insertFinalItems(
  insertItem: Database.Statement,
  matchId: number,
  playerId: number,
  slotType: string,
  items: any[]
): void {
  for (const item of items) {
    if (!item?.key) {
      continue;
    }
    insertItem.run(matchId, playerId, nullable(item.name), slotType, nullable(item.slot), 1, null);
  }
}

function nullable(value: unknown): unknown {
  return value === undefined || value === "" ? null : value;
}

export function markJobFailed(db: Db, job: QueuedJob, error: unknown): void {
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  db.prepare(`
    UPDATE parse_jobs
    SET status = 'failed', finished_at = ?, error_message = ?
    WHERE id = ?
  `).run(now, message, job.id);
  db.prepare(`
    UPDATE matches
    SET status = 'failed', error_message = ?, updated_at = ?
    WHERE id = ?
  `).run(message, now, job.matchId);
}

export interface ParsedMatchMetadata {
  matchId: string | null;
  duration: number | null;
  radiantScore: number | null;
  direScore: number | null;
  winner: string | null;
}
