import type { MatchesRepository } from "../repositories/matchesRepository";
import type { StorageService } from "./storageService";

interface BuildEntry {
  key: string;
  name: string;
  time: number | null;
}

interface BuildPattern {
  count: number;
  matches: number;
  items: BuildEntry[];
}

interface AbilityPattern {
  count: number;
  matches: number;
  abilities: Array<BuildEntry & { abilityLevel: number | null }>;
}

interface CommonItem {
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
  startingItems: BuildPattern | null;
  itemBuild: BuildPattern | null;
  abilityBuild: AbilityPattern | null;
  commonItems: CommonItem[];
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
  lastMatch: any | null;
  rows?: Array<{ match: any; player: any; won: boolean }>;
}

interface PatternBucket<T> {
  count: number;
  entries: T[];
}

const CACHE_TTL_MS = 30_000;
const STARTING_ITEM_WINDOW_SECONDS = 90;
const FALLBACK_STARTING_ITEM_WINDOW_SECONDS = 180;
const MAX_STARTING_ITEMS = 8;
const MAX_BUILD_ITEMS = 10;
const MAX_ABILITIES = 15;

const ignoredBuildItems = new Set([
  "aghanims_shard",
  "clarity",
  "dust",
  "enchanted_mango",
  "flask",
  "recipe",
  "smoke_of_deceit",
  "tango",
  "tpscroll",
  "ward_dispenser",
  "ward_observer",
  "ward_sentry"
]);

export class HeroAnalyticsService {
  private readonly buildCache = new Map<string, { expiresAt: number; value: HeroBuildAnalytics }>();
  private readonly heroStatsCache = new Map<string, { expiresAt: number; value: HeroStatsOverview }>();
  private indexCache: { expiresAt: number; value: HeroStatsOverview[] } | null = null;

  constructor(
    private readonly matches: MatchesRepository,
    private readonly storage: StorageService
  ) {}

  buildHeroIndexStats(): HeroStatsOverview[] {
    const now = Date.now();
    if (this.indexCache && this.indexCache.expiresAt > now) {
      return this.indexCache.value;
    }

    const value = summarizeHeroRows(this.matches.listHeroAppearances(), false);
    this.indexCache = { expiresAt: now + CACHE_TTL_MS, value };
    return value;
  }

  buildHeroStats(heroKey: string): HeroStatsOverview {
    const normalizedHero = normalizeHeroKey(heroKey);
    const now = Date.now();
    const cached = this.heroStatsCache.get(normalizedHero);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const value = summarizeHeroRows(this.matches.listHeroAppearances(normalizedHero), true)[0] || emptyHeroStats(normalizedHero, true);
    this.heroStatsCache.set(normalizedHero, { expiresAt: now + CACHE_TTL_MS, value });
    return value;
  }

  buildHeroAnalytics(heroKey: string): HeroBuildAnalytics {
    const normalizedHero = normalizeHeroKey(heroKey);
    const now = Date.now();
    const cached = this.buildCache.get(normalizedHero);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const startingPatterns = new Map<string, PatternBucket<BuildEntry>>();
    const itemPatterns = new Map<string, PatternBucket<BuildEntry>>();
    const abilityPatterns = new Map<string, PatternBucket<BuildEntry & { abilityLevel: number | null }>>();
    const commonItems = new Map<string, { key: string; name: string; count: number; totalTime: number; timedCount: number }>();
    let appearances = 0;

    for (const row of this.matches.listHeroAppearances(normalizedHero)) {
      const dashboard = this.storage.readDashboard(row.match.id) as any;
      if (!dashboard) {
        continue;
      }

      const players = Array.isArray(dashboard.players) ? dashboard.players : [];
      const heroPlayers = players.filter((player: any) => normalizeHeroKey(player.heroKey || player.hero || player.heroName) === normalizedHero);

      for (const player of heroPlayers) {
        const heroLookupKeys = heroKeysForPlayer(player);
        const purchases = firstArrayForHero(dashboard.itemBuilds, heroLookupKeys);
        const abilities = firstArrayForHero(dashboard.abilityBuilds, heroLookupKeys);

        appearances += 1;
        addPattern(startingPatterns, buildStartingSequence(purchases));
        const itemSequence = buildItemSequence(purchases);
        addPattern(itemPatterns, itemSequence);
        addPattern(abilityPatterns, buildAbilitySequence(abilities));

        for (const item of firstUniqueItems(itemSequence)) {
          const target = commonItems.get(item.key) || { key: item.key, name: item.name, count: 0, totalTime: 0, timedCount: 0 };
          target.count += 1;
          if (item.time != null) {
            target.totalTime += item.time;
            target.timedCount += 1;
          }
          commonItems.set(item.key, target);
        }
      }
    }

    const value = {
      heroKey: normalizedHero,
      appearances,
      startingItems: bestPattern(startingPatterns, appearances, "items"),
      itemBuild: bestPattern(itemPatterns, appearances, "items"),
      abilityBuild: bestPattern(abilityPatterns, appearances, "abilities"),
      commonItems: Array.from(commonItems.values())
        .map((item) => ({
          key: item.key,
          name: item.name,
          count: item.count,
          matches: appearances,
          frequency: appearances > 0 ? Math.round((item.count / appearances) * 1000) / 10 : 0,
          avgTime: item.timedCount > 0 ? Math.round(item.totalTime / item.timedCount) : null
        }))
        .sort((left, right) => right.count - left.count || Number(left.avgTime ?? 999999) - Number(right.avgTime ?? 999999))
        .slice(0, 12)
    };
    this.buildCache.set(normalizedHero, { expiresAt: now + CACHE_TTL_MS, value });
    return value;
  }
}

function summarizeHeroRows(rows: ReturnType<MatchesRepository["listHeroAppearances"]>, includeRows: boolean): HeroStatsOverview[] {
  const buckets = new Map<string, HeroStatsOverview & {
    killTotal: number;
    deathTotal: number;
    assistTotal: number;
    netTotal: number;
    statCount: number;
  }>();

  for (const row of rows) {
    if (!row.heroKey) {
      continue;
    }

    const bucket = buckets.get(row.heroKey) || {
      ...emptyHeroStats(row.heroKey, includeRows),
      killTotal: 0,
      deathTotal: 0,
      assistTotal: 0,
      netTotal: 0,
      statCount: 0
    };

    bucket.matches += 1;
    bucket.wins += row.won ? 1 : 0;
    bucket.losses += row.won ? 0 : 1;
    if (!bucket.lastMatch || timeValue(row.match.parsedAt || row.match.discoveredAt) > timeValue(bucket.lastMatch.parsedAt || bucket.lastMatch.discoveredAt)) {
      bucket.lastMatch = row.match;
    }

    const kills = Number(row.player.kills);
    const deaths = Number(row.player.deaths);
    const assists = Number(row.player.assists);
    const netWorth = Number(row.player.netWorth ?? row.player.gold);
    if ([kills, deaths, assists, netWorth].some(Number.isFinite)) {
      bucket.killTotal += Number.isFinite(kills) ? kills : 0;
      bucket.deathTotal += Number.isFinite(deaths) ? deaths : 0;
      bucket.assistTotal += Number.isFinite(assists) ? assists : 0;
      bucket.netTotal += Number.isFinite(netWorth) ? netWorth : 0;
      bucket.statCount += 1;
    }

    if (includeRows) {
      bucket.rows?.push({ match: row.match, player: row.player, won: row.won });
    }

    buckets.set(row.heroKey, bucket);
  }

  return Array.from(buckets.values()).map((bucket) => ({
    heroKey: bucket.heroKey,
    matches: bucket.matches,
    wins: bucket.wins,
    losses: bucket.losses,
    winRate: bucket.matches > 0 ? Math.round((bucket.wins / bucket.matches) * 1000) / 10 : null,
    avgKills: bucket.statCount > 0 ? roundOne(bucket.killTotal / bucket.statCount) : null,
    avgDeaths: bucket.statCount > 0 ? roundOne(bucket.deathTotal / bucket.statCount) : null,
    avgAssists: bucket.statCount > 0 ? roundOne(bucket.assistTotal / bucket.statCount) : null,
    avgNetWorth: bucket.statCount > 0 ? roundOne(bucket.netTotal / bucket.statCount) : null,
    lastMatch: bucket.lastMatch,
    ...(includeRows ? { rows: bucket.rows || [] } : {})
  }));
}

function emptyHeroStats(heroKey: string, includeRows: boolean): HeroStatsOverview {
  return {
    heroKey,
    matches: 0,
    wins: 0,
    losses: 0,
    winRate: null,
    avgKills: null,
    avgDeaths: null,
    avgAssists: null,
    avgNetWorth: null,
    lastMatch: null,
    ...(includeRows ? { rows: [] } : {})
  };
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function timeValue(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}

function heroKeysForPlayer(player: any): string[] {
  const keys = [
    player.hero,
    player.heroKey,
    player.heroName,
    player.heroKey ? `npc_dota_hero_${player.heroKey}` : null
  ].filter(Boolean).map(String);
  return Array.from(new Set(keys));
}

function firstArrayForHero(source: unknown, keys: string[]): any[] {
  if (!source || typeof source !== "object") {
    return [];
  }
  const record = source as Record<string, any>;
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key];
    }
  }
  const normalizedKeys = new Set(keys.map(normalizeHeroKey));
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value) && normalizedKeys.has(normalizeHeroKey(key))) {
      return value;
    }
  }
  return [];
}

function buildStartingSequence(purchases: any[]): BuildEntry[] {
  const clean = cleanItems(purchases, { includeRecipes: false, includeConsumables: true });
  const inWindow = clean.filter((item) => Number(item.time ?? 0) <= STARTING_ITEM_WINDOW_SECONDS);
  const source = inWindow.length > 0 ? inWindow : clean.filter((item) => Number(item.time ?? 0) <= FALLBACK_STARTING_ITEM_WINDOW_SECONDS);
  return compactNearbyDuplicates(source).slice(0, MAX_STARTING_ITEMS);
}

function buildItemSequence(purchases: any[]): BuildEntry[] {
  const clean = cleanItems(purchases, { includeRecipes: false, includeConsumables: false });
  return firstUniqueItems(clean).slice(0, MAX_BUILD_ITEMS);
}

function buildAbilitySequence(abilities: any[]): Array<BuildEntry & { abilityLevel: number | null }> {
  return abilities
    .filter((ability) => ability?.key && !isIgnoredAbility(String(ability.key)))
    .sort((left, right) => Number(left.time ?? 0) - Number(right.time ?? 0) || Number(left.tick ?? 0) - Number(right.tick ?? 0))
    .map((ability) => ({
      key: String(ability.key),
      name: String(ability.name || displayName(ability.key)),
      time: finiteNumberOrNull(ability.time),
      abilityLevel: finiteNumberOrNull(ability.abilityLevel)
    }))
    .slice(0, MAX_ABILITIES);
}

function isIgnoredAbility(key: string): boolean {
  return key.startsWith("special_bonus_attributes")
    || key === "special_bonus_base"
    || key.endsWith("_stop")
    || key.includes("_launch_")
    || key.includes("_toggle_");
}

function cleanItems(purchases: any[], options: { includeRecipes: boolean; includeConsumables: boolean }): BuildEntry[] {
  return purchases
    .filter((item) => item?.key)
    .filter((item) => options.includeRecipes || !String(item.key).startsWith("recipe_"))
    .filter((item) => options.includeConsumables || !ignoredBuildItems.has(String(item.key)))
    .filter((item) => !String(item.key).startsWith("enhancement_"))
    .sort((left, right) => Number(left.time ?? 0) - Number(right.time ?? 0) || Number(left.tick ?? 0) - Number(right.tick ?? 0))
    .map((item) => ({
      key: String(item.key),
      name: String(item.name || displayName(item.key)),
      time: finiteNumberOrNull(item.time)
    }));
}

function compactNearbyDuplicates(items: BuildEntry[]): BuildEntry[] {
  const result: BuildEntry[] = [];
  for (const item of items) {
    const previous = result[result.length - 1];
    if (previous?.key === item.key && item.time != null && previous.time != null && Math.abs(item.time - previous.time) <= 4) {
      continue;
    }
    result.push(item);
  }
  return result;
}

function firstUniqueItems(items: BuildEntry[]): BuildEntry[] {
  const seen = new Set<string>();
  const result: BuildEntry[] = [];
  for (const item of items) {
    if (seen.has(item.key)) {
      continue;
    }
    seen.add(item.key);
    result.push(item);
  }
  return result;
}

function addPattern<T extends BuildEntry>(patterns: Map<string, PatternBucket<T>>, entries: T[]): void {
  if (entries.length === 0) {
    return;
  }
  const key = entries.map((entry) => entry.key).join(">");
  const bucket = patterns.get(key) || { count: 0, entries };
  bucket.count += 1;
  patterns.set(key, bucket);
}

function bestPattern(patterns: Map<string, PatternBucket<any>>, matches: number, entryKey: "items" | "abilities"): any | null {
  const buckets = Array.from(patterns.values()).sort((left, right) => right.count - left.count || right.entries.length - left.entries.length);
  const best = buckets[0];
  if (!best) {
    return null;
  }
  return {
    count: best.count,
    matches,
    [entryKey]: best.entries
  };
}

function normalizeHeroKey(value: unknown): string {
  const normalized = String(value || "")
    .replace(/^npc_dota_hero_/, "")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase();
  const aliases: Record<string, string> = {
    "abyssal underlord": "abyssal_underlord",
    "anti mage": "antimage",
    "clockwerk": "rattletrap",
    "doom": "doom_bringer",
    "lifestealer": "life_stealer",
    "magnus": "magnataur",
    "nature's prophet": "furion",
    "natures prophet": "furion",
    "necrophos": "necrolyte",
    "outworld destroyer": "obsidian_destroyer",
    "queen of pain": "queenofpain",
    "shadow fiend": "nevermore",
    "timbersaw": "shredder",
    "underlord": "abyssal_underlord",
    "windranger": "windrunner",
    "wraith king": "skeleton_king",
    "zeus": "zuus"
  };
  return aliases[normalized] || normalized.replace(/\s+/g, "_");
}

function finiteNumberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function displayName(value: unknown): string {
  return String(value || "")
    .replace(/^item_/, "")
    .replace(/^npc_dota_hero_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
