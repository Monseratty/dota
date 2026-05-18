import type { MatchListItem } from "../api/client";
import { HEROES, getHeroByName, type HeroMeta } from "./heroes";

export interface HeroMatchRow {
  match: MatchListItem;
  player: any;
  won: boolean;
}

export interface HeroStats {
  hero: HeroMeta;
  matches: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgKills: number | null;
  avgDeaths: number | null;
  avgAssists: number | null;
  avgNetWorth: number | null;
  lastMatch: MatchListItem | null;
  rows: HeroMatchRow[];
}

export function buildHeroStats(matches: MatchListItem[], dashboards: Map<number, any>): Map<string, HeroStats> {
  const stats = new Map<string, HeroStats>();
  for (const hero of HEROES) {
    stats.set(hero.key, emptyStats(hero));
  }

  for (const match of matches) {
    const dashboard = dashboards.get(match.id);
    const players = Array.isArray(dashboard?.players) ? dashboard.players : [];
    const winnerTeam = winnerToTeam(match.winner || dashboard?.match?.winner);

    for (const player of players) {
      const hero = getHeroByName(player.heroKey || player.heroName || player.hero);
      if (!hero) {
        continue;
      }

      const target = stats.get(hero.key) || emptyStats(hero);
      const won = winnerTeam != null && Number(player.team) === winnerTeam;
      target.matches += 1;
      target.wins += won ? 1 : 0;
      target.losses += won ? 0 : 1;
      target.rows.push({ match, player, won });
      if (!target.lastMatch || timeValue(match.parsedAt || match.discoveredAt) > timeValue(target.lastMatch.parsedAt || target.lastMatch.discoveredAt)) {
        target.lastMatch = match;
      }
      stats.set(hero.key, target);
    }
  }

  for (const stat of stats.values()) {
    stat.winRate = stat.matches > 0 ? Math.round((stat.wins / stat.matches) * 1000) / 10 : null;
    stat.avgKills = average(stat.rows, (row) => row.player.kills);
    stat.avgDeaths = average(stat.rows, (row) => row.player.deaths);
    stat.avgAssists = average(stat.rows, (row) => row.player.assists);
    stat.avgNetWorth = average(stat.rows, (row) => row.player.netWorth ?? row.player.gold);
  }

  return stats;
}

function emptyStats(hero: HeroMeta): HeroStats {
  return {
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
  };
}

function average(rows: HeroMatchRow[], read: (row: HeroMatchRow) => unknown): number | null {
  const values = rows.map((row) => Number(read(row))).filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;
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

function timeValue(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}
