import fs from "node:fs";
import path from "node:path";
import type { ParsedMatchMetadata } from "../db";
import { projectRoot } from "../config";

const STEAM64_BASE = 76561197960265728n;

export function buildDashboard(outputDir: string): ParsedMatchMetadata {
  const summary = readJson(path.join(outputDir, "summary.json"));
  const scoreboard = readJson(path.join(outputDir, "scoreboard.json"));
  const finalInventory = readJson(path.join(outputDir, "final_inventory.json"));
  const summaryPlayers = summary?.dota?.players || [];
  const exactSteamIds = exactSteamIdsFromRawInfo(summary.rawInfoText);
  const proPlayers = readProPlayers();
  const combat = readCombatLog(path.join(outputDir, "combat_log.jsonl"));
  const skillEvents = readJsonlIfExists(path.join(outputDir, "skill_build.jsonl"));
  const itemBuilds = buildItemTimings(combat);
  const tickTime = buildTickTimeIndex(combat);
  const abilityBuilds = skillEvents.length > 0 ? buildExactSkillBuilds(skillEvents, tickTime) : buildObservedAbilityBuilds(combat);
  const timeline = buildTimeline(combat);

  const radiantPlayers = scoreboard.filter((row: any) => row.team === 2);
  const direPlayers = scoreboard.filter((row: any) => row.team === 3);
  const teamTotals = [teamTotal("Radiant", 2, radiantPlayers), teamTotal("Dire", 3, direPlayers)];
  const radiantScore = sum(radiantPlayers, "kills");
  const direScore = sum(direPlayers, "kills");
  const duration = Math.round(Number(summary.playbackTimeSeconds || 0));
  const matchId = summary?.dota?.matchId ? String(summary.dota.matchId) : null;
  const winner = summary?.dota?.gameWinner === 2 ? "Radiant" : summary?.dota?.gameWinner === 3 ? "Dire" : null;

  const dashboard = {
    summary,
    scoreboard,
    finalInventory,
    itemBuilds,
    abilityBuilds,
    timeline,
    teamTotals,
    match: {
      matchId,
      duration,
      radiantScore,
      direScore,
      winner,
      parsedAt: new Date().toISOString()
    },
    players: scoreboard.map((row: any) => {
      const summaryPlayer = summaryPlayers[row.index] || summaryPlayers.find((player: any) => {
        return player.name === row.name && player.gameTeam === row.team;
      });
      const hero = summaryPlayer?.hero || row.hero || "";
      const steamId = exactSteamIds[row.index] || (summaryPlayer?.steamId ? String(summaryPlayer.steamId) : null);
      const accountId = steamIdToAccountId(steamId);
      const pro = accountId == null ? null : proPlayers.get(accountId);
      return {
        ...row,
        steamId,
        accountId,
        originalName: row.name,
        displayName: pro?.name || row.name,
        isPro: Boolean(pro?.name),
        proTeam: pro?.team_name || pro?.team_tag || "",
        hero,
        heroKey: String(hero).replace(/^npc_dota_hero_/, ""),
        heroName: displayHero(hero),
        kda: Number(((Number(row.kills || 0) + Number(row.assists || 0)) / Math.max(1, Number(row.deaths || 0))).toFixed(2))
      };
    })
  };

  fs.writeFileSync(path.join(outputDir, "dashboard.json"), `${JSON.stringify(dashboard, null, 2)}\n`);

  return {
    matchId,
    duration,
    radiantScore,
    direScore,
    winner
  };
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readCombatLog(filePath: string): any[] {
  return readJsonlIfExists(filePath);
}

function readJsonlIfExists(filePath: string): any[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) {
    return [];
  }
  return text.split("\n").map((line) => JSON.parse(line));
}

function readProPlayers(): Map<number, any> {
  const filePath = path.join(projectRoot(), "data", "pro_players.json");
  if (!fs.existsSync(filePath)) {
    return new Map();
  }
  const players = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return new Map(players.map((player: any) => [Number(player.account_id), player]));
}

function exactSteamIdsFromRawInfo(raw: string | undefined): string[] {
  return [...String(raw || "").matchAll(/steamid: (\d+)/g)].map((match) => match[1]);
}

function steamIdToAccountId(steamId: string | null): number | null {
  if (!steamId) {
    return null;
  }
  try {
    return Number(BigInt(steamId) - STEAM64_BASE);
  } catch {
    return null;
  }
}

function buildItemTimings(events: any[]): Record<string, any[]> {
  const byHero: Record<string, any[]> = {};
  for (const event of events) {
    if (event.type !== "DOTA_COMBATLOG_PURCHASE" || !event.targetName || !event.valueName) {
      continue;
    }
    const hero = String(event.targetName);
    byHero[hero] ||= [];
    byHero[hero].push({
      tick: event.tick,
      time: gameTime(event.timestamp),
      rawTime: event.timestamp,
      item: event.valueName,
      key: itemKey(event.valueName),
      name: displayItem(event.valueName),
      networth: event.networth ?? null
    });
  }

  for (const purchases of Object.values(byHero)) {
    purchases.sort((a, b) => a.time - b.time);
  }
  return byHero;
}

function buildTimeline(events: any[]): any[] {
  const timeline: any[] = [];

  for (const event of events) {
    if (event.type === "DOTA_COMBATLOG_DEATH" && event.targetHero) {
      const damageSource = String(event.damageSourceName || "");
      if (!event.attackerHero && !damageSource.startsWith("npc_dota_hero_")) {
        continue;
      }
      const killer = event.attackerHero ? String(event.attackerName || "") : damageSource;
      const victim = String(event.targetName || "");
      timeline.push({
        type: "kill",
        tick: event.tick,
        time: gameTime(event.timestamp),
        team: event.attackerTeam ?? null,
        title: `${displayHero(killer)} killed ${displayHero(victim)}`,
        killer,
        victim,
        assists: Array.isArray(event.assistPlayers) ? event.assistPlayers : [],
        ability: event.inflictorName || event.valueName || null
      });
      continue;
    }

    if (event.type === "DOTA_COMBATLOG_FIRST_BLOOD") {
      timeline.push({
        type: "first_blood",
        tick: event.tick,
        time: gameTime(event.timestamp),
        team: event.attackerTeam ?? null,
        title: "First Blood"
      });
      continue;
    }

    if (event.type === "DOTA_COMBATLOG_TEAM_BUILDING_KILL" && event.targetName) {
      timeline.push({
        type: "objective",
        tick: event.tick,
        time: gameTime(event.timestamp),
        team: event.attackerTeam ?? null,
        title: `${teamName(event.attackerTeam)} destroyed ${displayBuilding(event.targetName)}`,
        target: event.targetName
      });
      continue;
    }

    if (event.type === "DOTA_COMBATLOG_BUYBACK" && event.valueName && event.valueName !== "dota_unknown") {
      timeline.push({
        type: "buyback",
        tick: event.tick,
        time: gameTime(event.timestamp),
        team: null,
        title: `${displayHero(event.valueName)} bought back`,
        hero: event.valueName
      });
    }
  }

  return timeline
    .filter((event) => Number.isFinite(event.time))
    .sort((a, b) => a.time - b.time || Number(a.tick || 0) - Number(b.tick || 0));
}

function buildObservedAbilityBuilds(events: any[]): Record<string, any[]> {
  const byHero: Record<string, any[]> = {};
  const maxSeen = new Map<string, number>();

  for (const event of events) {
    if (event.type !== "DOTA_COMBATLOG_ABILITY" || !event.attackerHero || !event.attackerName || !event.inflictorName) {
      continue;
    }

    const ability = String(event.inflictorName);
    if (ability.startsWith("item_")) {
      continue;
    }

    const hero = String(event.attackerName);
    const level = Number(event.abilityLevel || 0);
    const seenKey = `${hero}:${ability}`;
    const previous = maxSeen.get(seenKey) || 0;
    if (level <= previous) {
      continue;
    }

    maxSeen.set(seenKey, level);
    byHero[hero] ||= [];
    byHero[hero].push({
      tick: event.tick,
      time: gameTime(event.timestamp),
      rawTime: event.timestamp,
      ability,
      key: ability,
      name: displayAbility(ability),
      abilityLevel: level
    });
  }

  for (const abilities of Object.values(byHero)) {
    abilities.sort((a, b) => a.time - b.time);
  }
  return byHero;
}

function buildExactSkillBuilds(events: any[], tickTime: Array<{ tick: number; time: number }>): Record<string, any[]> {
  const byHero: Record<string, any[]> = {};

  for (const event of events) {
    if (!event.hero || !event.ability || !event.abilityLevel) {
      continue;
    }

    const hero = String(event.hero);
    const ability = String(event.ability);
    if (!isDisplayableSkill(hero, ability)) {
      continue;
    }

    byHero[hero] ||= [];
    const approximatedTime = timeForTick(Number(event.tick || 0), tickTime);
    byHero[hero].push({
      tick: event.tick,
      time: approximatedTime,
      ability,
      key: ability,
      name: displayAbility(ability),
      abilityLevel: event.abilityLevel,
      playerId: event.playerId ?? null,
      exact: true
    });
  }

  for (const abilities of Object.values(byHero)) {
    abilities.sort((a, b) => Number(a.tick || 0) - Number(b.tick || 0));
  }
  return byHero;
}

function buildTickTimeIndex(events: any[]): Array<{ tick: number; time: number }> {
  return events
    .filter((event) => Number.isFinite(Number(event.tick)) && Number.isFinite(Number(event.timestamp)))
    .map((event) => ({ tick: Number(event.tick), time: gameTime(Number(event.timestamp)) }))
    .sort((a, b) => a.tick - b.tick);
}

function timeForTick(tick: number, index: Array<{ tick: number; time: number }>): number | null {
  if (!index.length || !Number.isFinite(tick)) {
    return null;
  }

  let lo = 0;
  let hi = index.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (index[mid].tick === tick) {
      return index[mid].time;
    }
    if (index[mid].tick < tick) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const nearest = index[Math.max(0, Math.min(index.length - 1, lo))];
  return nearest.time;
}

function isDisplayableSkill(hero: string, ability: string): boolean {
  if (ability.startsWith("ability_")) return false;
  if (ability.startsWith("plus_")) return false;
  if (ability.startsWith("generic_hidden")) return false;
  if (ability.includes("empty")) return false;
  if (ability.includes("hidden")) return false;
  if (ability.includes("facet")) return false;

  if (hero === "npc_dota_hero_invoker") {
    return ability === "invoker_quas"
      || ability === "invoker_wex"
      || ability === "invoker_exort"
      || ability === "invoker_invoke";
  }

  return true;
}

function sum(rows: any[], key: string): number {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function teamTotal(name: string, team: number, players: any[]) {
  return {
    team,
    name,
    kills: sum(players, "kills"),
    deaths: sum(players, "deaths"),
    assists: sum(players, "assists"),
    gold: sum(players, "gold"),
    netWorth: sum(players, "netWorth"),
    lastHits: sum(players, "lastHits"),
    denies: sum(players, "denies")
  };
}

function teamName(team: number | null | undefined): string {
  return team === 2 ? "Radiant" : team === 3 ? "Dire" : "Unknown";
}

function displayHero(hero: string): string {
  return String(hero || "")
    .replace(/^npc_dota_hero_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function displayBuilding(building: string): string {
  return String(building || "")
    .replace(/^npc_dota_/, "")
    .replace(/^goodguys_/, "Radiant ")
    .replace(/^badguys_/, "Dire ")
    .replace(/_/g, " ")
    .replace(/\btower(\d)\b/i, "Tower $1")
    .replace(/\bmelee rax\b/i, "Melee Barracks")
    .replace(/\brange rax\b/i, "Ranged Barracks")
    .replace(/\bfort\b/i, "Ancient")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function itemKey(item: string): string {
  return String(item || "").replace(/^item_/, "");
}

function displayItem(item: string): string {
  return titleize(itemKey(item));
}

function displayAbility(ability: string): string {
  return titleize(String(ability || ""));
}

function titleize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function gameTime(timestamp: number): number {
  return Math.max(0, Math.round(Number(timestamp || 0) - 300));
}
