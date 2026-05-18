import { getDashboard, getMatches, type MatchListItem } from "../api/client";
import { buildHeroStats, type HeroStats } from "./heroStats";

export interface HeroAnalyticsData {
  matches: MatchListItem[];
  stats: Map<string, HeroStats>;
}

export async function loadHeroAnalytics(): Promise<HeroAnalyticsData> {
  const matches = (await getMatches()).filter((match) => match.status === "ready");
  const settled = await Promise.allSettled(matches.map(async (match) => [match.id, await getDashboard(String(match.id))] as const));
  const dashboards = new Map<number, any>();

  for (const result of settled) {
    if (result.status === "fulfilled") {
      dashboards.set(result.value[0], result.value[1]);
    }
  }

  return {
    matches,
    stats: buildHeroStats(matches, dashboards)
  };
}
