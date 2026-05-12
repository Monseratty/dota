import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "./config";

export type Db = Database.Database;

export interface QueuedJob {
  id: number;
  matchId: number;
  rawFilePath: string;
  attempts: number;
}

export function openDatabase(config: AppConfig): Db {
  const db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function getNextQueuedJob(db: Db): QueuedJob | null {
  const row = db.prepare(`
    SELECT
      id,
      match_id AS matchId,
      raw_file_path AS rawFilePath,
      attempts
    FROM parse_jobs
    WHERE status = 'queued'
    ORDER BY id ASC
    LIMIT 1
  `).get() as QueuedJob | undefined;

  return row || null;
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
