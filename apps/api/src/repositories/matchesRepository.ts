import fs from "node:fs";
import type { Db } from "../db/database";

interface CreateMatchInput {
  sourceFilename: string;
  rawFilePath: string;
  fileSize: number;
  rawStorageDriver?: "local" | "s3";
  rawStorageKey?: string | null;
  rawUploadedAt?: string | null;
}

export interface HeroAppearanceRow {
  match: any;
  player: {
    index: number | null;
    displayName: string | null;
    proName: string | null;
    heroName: string | null;
    team: number | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    netWorth: number | null;
    gold: number | null;
  };
  heroKey: string;
  won: boolean;
}

export class MatchesRepository {
  constructor(private readonly db: Db, private readonly hasDashboard?: (id: number) => boolean) {}

  list() {
    const rows = this.db.prepare(`
      SELECT
        id,
        match_id AS matchId,
        source_filename AS sourceFilename,
        raw_file_path AS rawFilePath,
        file_size AS fileSize,
        duration,
        radiant_score AS radiantScore,
        dire_score AS direScore,
        winner,
        status,
        discovered_at AS discoveredAt,
        queued_at AS queuedAt,
        parsed_at AS parsedAt,
        error_message AS errorMessage,
        raw_deleted_at AS rawDeletedAt,
        raw_delete_reason AS rawDeleteReason,
        raw_storage_driver AS rawStorageDriver,
        raw_storage_key AS rawStorageKey,
        raw_uploaded_at AS rawUploadedAt,
        raw_upload_error AS rawUploadError
      FROM matches
      WHERE status != 'deleted'
      ORDER BY id DESC
    `).all();

    return this.enrichRows(rows).map((row) => withRuntimeStatus(row, this.hasDashboard));
  }

  listRawCleanupCandidates(olderThan: Date) {
    const rows = this.db.prepare(`
      SELECT
        id,
        match_id AS matchId,
        source_filename AS sourceFilename,
        raw_file_path AS rawFilePath,
        file_size AS fileSize,
        duration,
        radiant_score AS radiantScore,
        dire_score AS direScore,
        winner,
        status,
        discovered_at AS discoveredAt,
        queued_at AS queuedAt,
        parsed_at AS parsedAt,
        error_message AS errorMessage,
        raw_deleted_at AS rawDeletedAt,
        raw_delete_reason AS rawDeleteReason,
        raw_storage_driver AS rawStorageDriver,
        raw_storage_key AS rawStorageKey,
        raw_uploaded_at AS rawUploadedAt,
        raw_upload_error AS rawUploadError
      FROM matches
      WHERE status = 'ready'
        AND raw_file_path IS NOT NULL
        AND raw_deleted_at IS NULL
        AND parsed_at IS NOT NULL
        AND parsed_at < ?
      ORDER BY parsed_at ASC
    `).all(olderThan.toISOString());

    return this.enrichRows(rows).map((row) => withRuntimeStatus(row, this.hasDashboard)).filter((row) => row.hasRawDemo);
  }

  findById(id: number) {
    const row = this.db.prepare(`
      SELECT
        id,
        match_id AS matchId,
        source_filename AS sourceFilename,
        raw_file_path AS rawFilePath,
        file_size AS fileSize,
        duration,
        radiant_score AS radiantScore,
        dire_score AS direScore,
        winner,
        status,
        discovered_at AS discoveredAt,
        queued_at AS queuedAt,
        parsed_at AS parsedAt,
        error_message AS errorMessage,
        raw_deleted_at AS rawDeletedAt,
        raw_delete_reason AS rawDeleteReason,
        raw_storage_driver AS rawStorageDriver,
        raw_storage_key AS rawStorageKey,
        raw_uploaded_at AS rawUploadedAt,
        raw_upload_error AS rawUploadError
      FROM matches
      WHERE id = ? AND status != 'deleted'
    `).get(id);

    return row ? withRuntimeStatus(this.enrichRows([row])[0], this.hasDashboard) : null;
  }

  findByRawPath(rawFilePath: string) {
    return this.db.prepare("SELECT * FROM matches WHERE raw_file_path = ? AND status != 'deleted'").get(rawFilePath);
  }

  findBySourceFilename(sourceFilename: string) {
    return this.db.prepare("SELECT * FROM matches WHERE source_filename = ? AND status != 'deleted'").get(sourceFilename);
  }

  listHeroAppearances(heroKey?: string): HeroAppearanceRow[] {
    const rows = this.db.prepare(`
      SELECT
        matches.id,
        matches.match_id AS matchId,
        matches.source_filename AS sourceFilename,
        matches.raw_file_path AS rawFilePath,
        matches.file_size AS fileSize,
        matches.duration,
        matches.radiant_score AS radiantScore,
        matches.dire_score AS direScore,
        matches.winner,
        matches.status,
        matches.discovered_at AS discoveredAt,
        matches.queued_at AS queuedAt,
        matches.parsed_at AS parsedAt,
        matches.error_message AS errorMessage,
        matches.raw_deleted_at AS rawDeletedAt,
        matches.raw_delete_reason AS rawDeleteReason,
        matches.raw_storage_driver AS rawStorageDriver,
        matches.raw_storage_key AS rawStorageKey,
        matches.raw_uploaded_at AS rawUploadedAt,
        matches.raw_upload_error AS rawUploadError,
        players.slot AS playerIndex,
        players.display_name AS displayName,
        players.pro_name AS proName,
        players.hero_name AS heroName,
        players.team,
        players.kills,
        players.deaths,
        players.assists,
        players.net_worth AS netWorth
      FROM players
      JOIN matches ON matches.id = players.match_id
      WHERE matches.status = 'ready'
        AND matches.status != 'deleted'
      ORDER BY COALESCE(matches.parsed_at, matches.discovered_at) DESC, matches.id DESC, players.team ASC, players.slot ASC
    `).all() as any[];

    const normalizedFilter = heroKey ? normalizeHeroKey(heroKey) : null;
    return rows
      .map((row) => {
        const normalizedHero = normalizeHeroKey(row.heroName);
        return {
          match: toRuntimeMatch(row),
          player: {
            index: nullableNumber(row.playerIndex),
            displayName: row.displayName ?? null,
            proName: row.proName ?? null,
            heroName: row.heroName ?? null,
            team: nullableNumber(row.team),
            kills: nullableNumber(row.kills),
            deaths: nullableNumber(row.deaths),
            assists: nullableNumber(row.assists),
            netWorth: nullableNumber(row.netWorth),
            gold: nullableNumber(row.netWorth)
          },
          heroKey: normalizedHero,
          won: winnerToTeam(row.winner) != null && Number(row.team) === winnerToTeam(row.winner)
        };
      })
      .filter((row) => row.heroKey && (!normalizedFilter || row.heroKey === normalizedFilter));
  }

  createQueued(input: CreateMatchInput): number {
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO matches (
        source_filename,
        raw_file_path,
        file_size,
        raw_storage_driver,
        raw_storage_key,
        raw_uploaded_at,
        status,
        discovered_at,
        queued_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)
    `);
    const result = insert.run(
      input.sourceFilename,
      input.rawFilePath,
      input.fileSize,
      input.rawStorageDriver || "local",
      input.rawStorageKey || null,
      input.rawUploadedAt || null,
      now,
      now,
      now
    );
    return Number(result.lastInsertRowid);
  }

  markDeleted(id: number): void {
    this.db.prepare(`
      UPDATE matches
      SET status = 'deleted', updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);
  }

  markQueued(id: number): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE matches
      SET status = 'queued', queued_at = ?, parsed_at = NULL, error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, now, id);
  }

  markRawDeleted(id: number, reason: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE matches
      SET raw_deleted_at = ?, raw_delete_reason = ?, raw_storage_key = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, reason, now, id);
  }

  markRawUploaded(id: number, key: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE matches
      SET raw_storage_driver = 's3', raw_storage_key = ?, raw_uploaded_at = ?, raw_upload_error = NULL, updated_at = ?
      WHERE id = ?
    `).run(key, now, now, id);
  }

  markRawUploadFailed(id: number, error: unknown): void {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    this.db.prepare(`
      UPDATE matches
      SET raw_upload_error = ?, updated_at = ?
      WHERE id = ?
    `).run(message, now, id);
  }

  private enrichRows(rows: any[]): any[] {
    if (rows.length === 0) {
      return rows;
    }

    const byMatchId = new Map<number, { heroes: Set<string>; proPlayers: Set<string> }>();
    for (const row of rows) {
      byMatchId.set(Number(row.id), { heroes: new Set(), proPlayers: new Set() });
    }

    const placeholders = rows.map(() => "?").join(",");
    const players = this.db.prepare(`
      SELECT
        match_id AS matchDbId,
        hero_name AS heroName,
        display_name AS displayName,
        pro_name AS proName
      FROM players
      WHERE match_id IN (${placeholders})
      ORDER BY team ASC, slot ASC
    `).all(...rows.map((row) => row.id)) as Array<{
      matchDbId: number;
      heroName: string | null;
      displayName: string | null;
      proName: string | null;
    }>;

    for (const player of players) {
      const target = byMatchId.get(Number(player.matchDbId));
      if (!target) {
        continue;
      }
      if (player.heroName) {
        target.heroes.add(player.heroName);
      }
      if (player.proName) {
        target.proPlayers.add(player.proName);
      }
    }

    return rows.map((row) => {
      const fields = byMatchId.get(Number(row.id));
      return {
        ...row,
        heroes: fields ? Array.from(fields.heroes) : [],
        proPlayers: fields ? Array.from(fields.proPlayers) : []
      };
    });
  }
}

function toRuntimeMatch(row: any) {
  const hasRemoteRawDemo = Boolean(row.rawStorageKey && !row.rawDeletedAt);
  const hasLocalRawDemo = Boolean(row.rawFilePath && !row.rawDeletedAt);
  const hasRawDemo = hasRemoteRawDemo || hasLocalRawDemo;
  return {
    id: row.id,
    matchId: row.matchId,
    sourceFilename: row.sourceFilename,
    rawFilePath: row.rawFilePath,
    fileSize: row.fileSize,
    duration: row.duration,
    radiantScore: row.radiantScore,
    direScore: row.direScore,
    winner: row.winner,
    status: row.status,
    discoveredAt: row.discoveredAt,
    queuedAt: row.queuedAt,
    parsedAt: row.parsedAt,
    errorMessage: row.errorMessage,
    hasRawDemo,
    hasLocalRawDemo,
    hasRemoteRawDemo,
    rawDemoSize: hasRawDemo ? row.fileSize : null,
    rawStorageDriver: row.rawStorageDriver,
    rawStorageKey: row.rawStorageKey,
    rawUploadedAt: row.rawUploadedAt,
    rawUploadError: row.rawUploadError,
    downloadUrl: hasRawDemo ? `/api/matches/${row.id}/download` : null,
    dashboardReady: true,
    heroes: [],
    proPlayers: []
  };
}

function nullableNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function winnerToTeam(winner: string | null | undefined): number | null {
  const normalized = String(winner || "").toLowerCase();
  if (normalized === "radiant" || normalized === "2") {
    return 2;
  }
  if (normalized === "dire" || normalized === "3") {
    return 3;
  }
  return null;
}

function normalizeHeroKey(value: unknown): string {
  const normalized = String(value || "")
    .replace(/^npc_dota_hero_/, "")
    .replace(/_/g, " ")
    .replace(/[’']/g, "")
    .trim()
    .toLowerCase();
  const aliases: Record<string, string> = {
    "abyssal underlord": "abyssal_underlord",
    "anti mage": "antimage",
    "anti-mage": "antimage",
    "clockwerk": "rattletrap",
    "doom": "doom_bringer",
    "doom bringer": "doom_bringer",
    "io": "wisp",
    "lifestealer": "life_stealer",
    "life stealer": "life_stealer",
    "magnus": "magnataur",
    "natures prophet": "furion",
    "nature prophet": "furion",
    "nature's prophet": "furion",
    "necrophos": "necrolyte",
    "outworld destroyer": "obsidian_destroyer",
    "queen of pain": "queenofpain",
    "shadow fiend": "nevermore",
    "timbersaw": "shredder",
    "treant protector": "treant",
    "underlord": "abyssal_underlord",
    "vengeful spirit": "vengefulspirit",
    "windranger": "windrunner",
    "wraith king": "skeleton_king",
    "zeus": "zuus"
  };
  return aliases[normalized] || normalized.replace(/\s+/g, "_");
}

function withRuntimeStatus(row: any, hasDashboard?: (id: number) => boolean) {
  const hasLocalRawDemo = Boolean(row.rawFilePath && fs.existsSync(row.rawFilePath));
  const hasRemoteRawDemo = Boolean(row.rawStorageKey && !row.rawDeletedAt);
  const hasRawDemo = Boolean(!row.rawDeletedAt && (hasLocalRawDemo || hasRemoteRawDemo));
  const dashboardReady = Boolean(hasDashboard?.(row.id));
  return {
    ...row,
    hasRawDemo,
    hasLocalRawDemo,
    hasRemoteRawDemo,
    rawDemoSize: hasLocalRawDemo ? fs.statSync(row.rawFilePath).size : hasRemoteRawDemo ? row.fileSize : null,
    downloadUrl: hasRawDemo ? `/api/matches/${row.id}/download` : null,
    dashboardReady
  };
}
