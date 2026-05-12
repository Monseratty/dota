const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4300";

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
  status: "discovered" | "queued" | "parsing" | "ready" | "failed" | "deleted";
  discoveredAt: string;
  queuedAt: string | null;
  parsedAt: string | null;
  errorMessage: string | null;
  hasRawDemo: boolean;
  rawDemoSize: number | null;
  downloadUrl: string | null;
  dashboardReady: boolean;
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

export interface ParseJob {
  id: number;
  matchId: number;
  rawFilePath: string;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface ParserLog {
  jobId: number;
  exists: boolean;
  text: string;
  truncated: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  return request<StorageInfo>("/api/system/storage");
}

export async function getMatches(): Promise<MatchListItem[]> {
  const data = await request<{ matches: MatchListItem[] }>("/api/matches");
  return data.matches;
}

export async function getMatch(id: string): Promise<MatchListItem> {
  const data = await request<{ match: MatchListItem }>(`/api/matches/${id}`);
  return data.match;
}

export async function getMatchDetails(id: string): Promise<{ match: MatchListItem; latestJob: ParseJob | null }> {
  return request<{ match: MatchListItem; latestJob: ParseJob | null }>(`/api/matches/${id}`);
}

export async function getDashboard(id: string): Promise<any> {
  return request<any>(`/api/matches/${id}/dashboard`);
}

export async function getJobs(): Promise<ParseJob[]> {
  const data = await request<{ jobs: ParseJob[] }>("/api/jobs");
  return data.jobs;
}

export async function getJobLog(id: number): Promise<ParserLog> {
  return request<ParserLog>(`/api/jobs/${id}/log`);
}

export async function retryJob(id: number): Promise<void> {
  await request(`/api/jobs/${id}/retry`, { method: "POST" });
}

export async function rescanFolder(): Promise<{ scanned: number; imported: number; skipped: Array<{ file: string; reason: string }> }> {
  return request("/api/system/rescan", { method: "POST" });
}

export async function deleteMatch(id: number): Promise<void> {
  await request(`/api/matches/${id}`, { method: "DELETE" });
}

export async function reparseMatch(id: number): Promise<void> {
  await request(`/api/matches/${id}/reparse`, { method: "POST" });
}

export async function deleteRawReplay(id: number): Promise<void> {
  await request(`/api/matches/${id}/raw`, { method: "DELETE" });
}

export function downloadUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}
