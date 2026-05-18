const API_BASE_STORAGE_KEY = "dota-replay-api-base";
const API_BASE = resolveApiBase();

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
  hasLocalRawDemo: boolean;
  hasRemoteRawDemo: boolean;
  rawDemoSize: number | null;
  rawStorageDriver: string | null;
  rawStorageKey: string | null;
  rawUploadedAt: string | null;
  rawUploadError: string | null;
  downloadUrl: string | null;
  dashboardReady: boolean;
  heroes?: string[];
  proPlayers?: string[];
}

export interface AdminSession {
  configured: boolean;
  authenticated: boolean;
}

export interface StorageInfo {
  storagePath: string;
  inboxPath: string;
  rawDemoPath: string;
  tempDemoPath?: string;
  parsedPath: string;
  failedPath: string;
  parserLogPath: string;
  databasePath: string;
  replayStorage?: {
    driver: "local" | "s3";
    endpoint?: string;
    region?: string;
    bucket?: string;
    uploadPrefix?: string;
    directUploadPrefix?: string;
  };
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

export interface ReplayUploadTicket {
  uploadId: string;
  key: string;
  url: string;
  headers: Record<string, string>;
}

export interface HeroBuildEntry {
  key: string;
  name: string;
  time: number | null;
}

export interface HeroAbilityBuildEntry extends HeroBuildEntry {
  abilityLevel: number | null;
}

export interface HeroBuildPattern {
  count: number;
  matches: number;
  items: HeroBuildEntry[];
}

export interface HeroAbilityBuildPattern {
  count: number;
  matches: number;
  abilities: HeroAbilityBuildEntry[];
}

export interface HeroCommonItem {
  key: string;
  name: string;
  count: number;
  matches: number;
  frequency: number;
  avgTime: number | null;
}

export interface HeroBuildAnalytics {
  heroKey: string;
  appearances: number;
  startingItems: HeroBuildPattern | null;
  itemBuild: HeroBuildPattern | null;
  abilityBuild: HeroAbilityBuildPattern | null;
  commonItems: HeroCommonItem[];
}

export interface HeroStatsRow {
  match: MatchListItem;
  player: any;
  won: boolean;
}

export interface HeroStatsOverview {
  heroKey: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgKills: number | null;
  avgDeaths: number | null;
  avgAssists: number | null;
  avgNetWorth: number | null;
  lastMatch: MatchListItem | null;
  rows?: HeroStatsRow[];
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

export async function getHeroBuildAnalytics(heroKey: string): Promise<HeroBuildAnalytics> {
  const data = await request<{ analytics: HeroBuildAnalytics }>(`/api/heroes/${encodeURIComponent(heroKey)}/analytics`);
  return data.analytics;
}

export async function getHeroStatsIndex(): Promise<HeroStatsOverview[]> {
  const data = await request<{ stats: HeroStatsOverview[] }>("/api/heroes/stats");
  return data.stats;
}

export async function getHeroStats(heroKey: string): Promise<HeroStatsOverview> {
  const data = await request<{ stats: HeroStatsOverview }>(`/api/heroes/${encodeURIComponent(heroKey)}/stats`);
  return data.stats;
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

export async function presignReplayUpload(file: File): Promise<ReplayUploadTicket> {
  return request<ReplayUploadTicket>("/api/uploads/replays/presign", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      filename: file.name,
      fileSize: file.size
    })
  });
}

export async function completeReplayUpload(ticket: ReplayUploadTicket, file: File): Promise<{ ok: boolean; match: MatchListItem; jobId: number }> {
  return request<{ ok: boolean; match: MatchListItem; jobId: number }>("/api/uploads/replays/complete", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      uploadId: ticket.uploadId,
      key: ticket.key,
      filename: file.name,
      fileSize: file.size
    })
  });
}

export function downloadUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function getAdminSession(): Promise<AdminSession> {
  return request<AdminSession>("/api/admin/session");
}

export async function adminLogin(password: string): Promise<void> {
  await request("/api/admin/login", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ password })
  });
}

export async function adminLogout(): Promise<void> {
  await request("/api/admin/logout", { method: "POST" });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

function resolveApiBase(): string {
  const runtimeApiBase = readRuntimeApiBase();
  if (runtimeApiBase) {
    return runtimeApiBase;
  }

  const configured = import.meta.env.VITE_API_BASE?.trim();
  if (configured) {
    return normalizeApiBase(configured, window.location.origin);
  }

  const inferred = `${window.location.protocol}//${window.location.hostname}:4300`;
  return normalizeApiBase(inferred, window.location.origin);
}

function readRuntimeApiBase(): string | null {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("api") || url.searchParams.get("apiBase");
    if (fromQuery) {
      const normalized = normalizeApiBase(fromQuery, window.location.origin);
      window.localStorage.setItem(apiBaseStorageKey(), normalized);
      return normalized;
    }

    const stored = window.localStorage.getItem(apiBaseStorageKey());
    if (stored) {
      return normalizeApiBase(stored, window.location.origin);
    }

    const legacyStored = window.localStorage.getItem(API_BASE_STORAGE_KEY);
    if (legacyStored && shouldUseLegacyApiBase(legacyStored)) {
      const normalized = normalizeApiBase(legacyStored, window.location.origin);
      window.localStorage.setItem(apiBaseStorageKey(), normalized);
      return normalized;
    }

    if (legacyStored && !shouldUseLegacyApiBase(legacyStored)) {
      window.localStorage.removeItem(API_BASE_STORAGE_KEY);
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeApiBase(value: string, base: string): string {
  return new URL(value, base).toString().replace(/\/$/, "");
}

function apiBaseStorageKey(): string {
  return `${API_BASE_STORAGE_KEY}:${window.location.origin}`;
}

function shouldUseLegacyApiBase(value: string): boolean {
  try {
    const legacy = new URL(value, window.location.origin);
    return legacy.hostname === window.location.hostname;
  } catch {
    return false;
  }
}
