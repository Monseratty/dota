export type MatchStatus =
  | "discovered"
  | "queued"
  | "parsing"
  | "ready"
  | "failed"
  | "deleted";

export type ParseJobStatus = "queued" | "running" | "done" | "failed";

export interface MatchListItem {
  id: number;
  matchId: string | null;
  sourceFilename: string;
  rawFilePath: string | null;
  fileSize: number;
  duration: number | null;
  radiantScore: number | null;
  direScore: number | null;
  winner: string | null;
  status: MatchStatus;
  discoveredAt: string;
  queuedAt: string | null;
  parsedAt: string | null;
  errorMessage: string | null;
  hasRawDemo: boolean;
  rawDemoSize: number | null;
  hasLocalRawDemo?: boolean;
  hasRemoteRawDemo?: boolean;
  rawStorageDriver?: string | null;
  rawStorageKey?: string | null;
  rawUploadedAt?: string | null;
  rawUploadError?: string | null;
  heroes?: string[];
  proPlayers?: string[];
}

export interface ParseJob {
  id: number;
  matchId: number;
  rawFilePath: string;
  status: ParseJobStatus;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface StorageInfo {
  storagePath: string;
  inboxPath: string;
  rawDemoPath: string;
  parsedPath: string;
  failedPath: string;
  parserLogPath: string;
  databasePath: string;
}
