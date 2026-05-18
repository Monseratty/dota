import { getHeroStatsIndex, type HeroStatsOverview, type MatchListItem } from "../api/client";
import { HEROES, getHeroByKey } from "./heroes";
import type { HeroStats } from "./heroStats";

export interface HeroAnalyticsData {
  matches: MatchListItem[];
  stats: Map<string, HeroStats>;
}

export async function loadHeroAnalytics(): Promise<HeroAnalyticsData> {
  const summaries = await getHeroStatsIndex();
  const stats = new Map<string, HeroStats>();

  for (const hero of HEROES) {
    stats.set(hero.key, {
      hero,
      matches: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      avgKills: null,
      avgDeaths: null,
      avgAssists: null,
      avgNetWorth: null,
      lastMatch: null,
      rows: []
    });
  }

  for (const summary of summaries) {
    const hero = getHeroByKey(summary.heroKey);
    if (hero) {
      stats.set(hero.key, toHeroStats(summary));
    }
  }

  return {
    matches: summaries.map((summary) => summary.lastMatch).filter(Boolean) as MatchListItem[],
    stats
  };
}

export function toHeroStats(summary: HeroStatsOverview): HeroStats {
  const hero = getHeroByKey(summary.heroKey);
  if (!hero) {
    throw new Error(`Unknown hero key: ${summary.heroKey}`);
  }

  return {
    hero,
    matches: summary.matches,
    wins: summary.wins,
    losses: summary.losses,
    winRate: summary.winRate,
    avgKills: summary.avgKills,
    avgDeaths: summary.avgDeaths,
    avgAssists: summary.avgAssists,
    avgNetWorth: summary.avgNetWorth,
    lastMatch: summary.lastMatch,
    rows: summary.rows || []
  };
}
