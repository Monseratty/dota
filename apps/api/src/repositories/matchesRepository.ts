import fs from "node:fs";
import type { Db } from "../db/database";

interface CreateMatchInput {
  sourceFilename: string;
  rawFilePath: string;
  fileSize: number;
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
        raw_delete_reason AS rawDeleteReason
      FROM matches
      WHERE status != 'deleted'
      ORDER BY id DESC
    `).all();

    return rows.map((row) => withRuntimeStatus(row, this.hasDashboard));
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
        raw_delete_reason AS rawDeleteReason
      FROM matches
      WHERE id = ? AND status != 'deleted'
    `).get(id);

    return row ? withRuntimeStatus(row, this.hasDashboard) : null;
  }

  findByRawPath(rawFilePath: string) {
    return this.db.prepare("SELECT * FROM matches WHERE raw_file_path = ? AND status != 'deleted'").get(rawFilePath);
  }

  findBySourceFilename(sourceFilename: string) {
    return this.db.prepare("SELECT * FROM matches WHERE source_filename = ? AND status != 'deleted'").get(sourceFilename);
  }

  createQueued(input: CreateMatchInput): number {
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO matches (
        source_filename,
        raw_file_path,
        file_size,
        status,
        discovered_at,
        queued_at,
        updated_at
      )
      VALUES (?, ?, ?, 'queued', ?, ?, ?)
    `);
    const result = insert.run(input.sourceFilename, input.rawFilePath, input.fileSize, now, now, now);
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
}

function withRuntimeStatus(row: any, hasDashboard?: (id: number) => boolean) {
  const hasRawDemo = Boolean(row.rawFilePath && fs.existsSync(row.rawFilePath));
  const dashboardReady = Boolean(hasDashboard?.(row.id));
  return {
    ...row,
    hasRawDemo,
    rawDemoSize: hasRawDemo ? fs.statSync(row.rawFilePath).size : null,
    downloadUrl: hasRawDemo ? `/api/matches/${row.id}/download` : null,
    dashboardReady
  };
}
