import type { Db } from "../db/database";

export interface ParseJobRow {
  id: number;
  matchId: number;
  rawFilePath: string;
  status: string;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

export class JobsRepository {
  constructor(private readonly db: Db) {}

  createQueued(matchId: number, rawFilePath: string): number {
    const result = this.db.prepare(`
      INSERT INTO parse_jobs (match_id, raw_file_path, status, attempts, created_at)
      VALUES (?, ?, 'queued', 0, ?)
    `).run(matchId, rawFilePath, new Date().toISOString());
    return Number(result.lastInsertRowid);
  }

  listRecent() {
    return this.db.prepare(`
      SELECT
        id,
        match_id AS matchId,
        raw_file_path AS rawFilePath,
        status,
        attempts,
        created_at AS createdAt,
        started_at AS startedAt,
        finished_at AS finishedAt,
        error_message AS errorMessage
      FROM parse_jobs
      ORDER BY id DESC
      LIMIT 100
    `).all();
  }

  findLatestForMatch(matchId: number) {
    return this.db.prepare(`
      SELECT
        id,
        match_id AS matchId,
        raw_file_path AS rawFilePath,
        status,
        attempts,
        created_at AS createdAt,
        started_at AS startedAt,
        finished_at AS finishedAt,
        error_message AS errorMessage
      FROM parse_jobs
      WHERE match_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(matchId);
  }

  findById(id: number): ParseJobRow | null {
    return this.db.prepare(`
      SELECT
        id,
        match_id AS matchId,
        raw_file_path AS rawFilePath,
        status,
        attempts,
        created_at AS createdAt,
        started_at AS startedAt,
        finished_at AS finishedAt,
        error_message AS errorMessage
      FROM parse_jobs
      WHERE id = ?
    `).get(id) as ParseJobRow | undefined || null;
  }
}
