export type HeroAttribute = "strength" | "agility" | "intelligence" | "universal";

export interface HeroMeta {
  id: number;
  key: string;
  name: string;
  attribute: HeroAttribute;
}

export const HERO_ATTRIBUTE_LABELS: Record<HeroAttribute, string> = {
  strength: "Strength",
  agility: "Agility",
  intelligence: "Intelligence",
  universal: "Universal"
};

export const HERO_ATTRIBUTE_ORDER: HeroAttribute[] = ["strength", "agility", "intelligence", "universal"];

export const HEROES: HeroMeta[] = [
  { id: 1, key: "antimage", name: "Anti-Mage", attribute: "agility" },
  { id: 2, key: "axe", name: "Axe", attribute: "strength" },
  { id: 3, key: "bane", name: "Bane", attribute: "universal" },
  { id: 4, key: "bloodseeker", name: "Bloodseeker", attribute: "agility" },
  { id: 5, key: "crystal_maiden", name: "Crystal Maiden", attribute: "intelligence" },
  { id: 6, key: "drow_ranger", name: "Drow Ranger", attribute: "agility" },
  { id: 7, key: "earthshaker", name: "Earthshaker", attribute: "strength" },
  { id: 8, key: "juggernaut", name: "Juggernaut", attribute: "agility" },
  { id: 9, key: "mirana", name: "Mirana", attribute: "agility" },
  { id: 10, key: "morphling", name: "Morphling", attribute: "agility" },
  { id: 11, key: "nevermore", name: "Shadow Fiend", attribute: "agility" },
  { id: 12, key: "phantom_lancer", name: "Phantom Lancer", attribute: "agility" },
  { id: 13, key: "puck", name: "Puck", attribute: "intelligence" },
  { id: 14, key: "pudge", name: "Pudge", attribute: "strength" },
  { id: 15, key: "razor", name: "Razor", attribute: "agility" },
  { id: 16, key: "sand_king", name: "Sand King", attribute: "universal" },
  { id: 17, key: "storm_spirit", name: "Storm Spirit", attribute: "intelligence" },
  { id: 18, key: "sven", name: "Sven", attribute: "strength" },
  { id: 19, key: "tiny", name: "Tiny", attribute: "strength" },
  { id: 20, key: "vengefulspirit", name: "Vengeful Spirit", attribute: "agility" },
  { id: 21, key: "windrunner", name: "Windranger", attribute: "universal" },
  { id: 22, key: "zuus", name: "Zeus", attribute: "intelligence" },
  { id: 23, key: "kunkka", name: "Kunkka", attribute: "strength" },
  { id: 25, key: "lina", name: "Lina", attribute: "intelligence" },
  { id: 26, key: "lion", name: "Lion", attribute: "intelligence" },
  { id: 27, key: "shadow_shaman", name: "Shadow Shaman", attribute: "intelligence" },
  { id: 28, key: "slardar", name: "Slardar", attribute: "strength" },
  { id: 29, key: "tidehunter", name: "Tidehunter", attribute: "strength" },
  { id: 30, key: "witch_doctor", name: "Witch Doctor", attribute: "intelligence" },
  { id: 31, key: "lich", name: "Lich", attribute: "intelligence" },
  { id: 32, key: "riki", name: "Riki", attribute: "agility" },
  { id: 33, key: "enigma", name: "Enigma", attribute: "universal" },
  { id: 34, key: "tinker", name: "Tinker", attribute: "intelligence" },
  { id: 35, key: "sniper", name: "Sniper", attribute: "agility" },
  { id: 36, key: "necrolyte", name: "Necrophos", attribute: "intelligence" },
  { id: 37, key: "warlock", name: "Warlock", attribute: "intelligence" },
  { id: 38, key: "beastmaster", name: "Beastmaster", attribute: "universal" },
  { id: 39, key: "queenofpain", name: "Queen of Pain", attribute: "intelligence" },
  { id: 40, key: "venomancer", name: "Venomancer", attribute: "universal" },
  { id: 41, key: "faceless_void", name: "Faceless Void", attribute: "agility" },
  { id: 42, key: "skeleton_king", name: "Wraith King", attribute: "strength" },
  { id: 43, key: "death_prophet", name: "Death Prophet", attribute: "universal" },
  { id: 44, key: "phantom_assassin", name: "Phantom Assassin", attribute: "agility" },
  { id: 45, key: "pugna", name: "Pugna", attribute: "intelligence" },
  { id: 46, key: "templar_assassin", name: "Templar Assassin", attribute: "agility" },
  { id: 47, key: "viper", name: "Viper", attribute: "agility" },
  { id: 48, key: "luna", name: "Luna", attribute: "agility" },
  { id: 49, key: "dragon_knight", name: "Dragon Knight", attribute: "strength" },
  { id: 50, key: "dazzle", name: "Dazzle", attribute: "universal" },
  { id: 51, key: "rattletrap", name: "Clockwerk", attribute: "strength" },
  { id: 52, key: "leshrac", name: "Leshrac", attribute: "intelligence" },
  { id: 53, key: "furion", name: "Nature's Prophet", attribute: "universal" },
  { id: 54, key: "life_stealer", name: "Lifestealer", attribute: "strength" },
  { id: 55, key: "dark_seer", name: "Dark Seer", attribute: "intelligence" },
  { id: 56, key: "clinkz", name: "Clinkz", attribute: "agility" },
  { id: 57, key: "omniknight", name: "Omniknight", attribute: "strength" },
  { id: 58, key: "enchantress", name: "Enchantress", attribute: "intelligence" },
  { id: 59, key: "huskar", name: "Huskar", attribute: "strength" },
  { id: 60, key: "night_stalker", name: "Night Stalker", attribute: "strength" },
  { id: 61, key: "broodmother", name: "Broodmother", attribute: "agility" },
  { id: 62, key: "bounty_hunter", name: "Bounty Hunter", attribute: "agility" },
  { id: 63, key: "weaver", name: "Weaver", attribute: "agility" },
  { id: 64, key: "jakiro", name: "Jakiro", attribute: "intelligence" },
  { id: 65, key: "batrider", name: "Batrider", attribute: "universal" },
  { id: 66, key: "chen", name: "Chen", attribute: "intelligence" },
  { id: 67, key: "spectre", name: "Spectre", attribute: "agility" },
  { id: 68, key: "ancient_apparition", name: "Ancient Apparition", attribute: "intelligence" },
  { id: 69, key: "doom_bringer", name: "Doom", attribute: "strength" },
  { id: 70, key: "ursa", name: "Ursa", attribute: "agility" },
  { id: 71, key: "spirit_breaker", name: "Spirit Breaker", attribute: "strength" },
  { id: 72, key: "gyrocopter", name: "Gyrocopter", attribute: "agility" },
  { id: 73, key: "alchemist", name: "Alchemist", attribute: "strength" },
  { id: 74, key: "invoker", name: "Invoker", attribute: "intelligence" },
  { id: 75, key: "silencer", name: "Silencer", attribute: "intelligence" },
  { id: 76, key: "obsidian_destroyer", name: "Outworld Destroyer", attribute: "intelligence" },
  { id: 77, key: "lycan", name: "Lycan", attribute: "strength" },
  { id: 78, key: "brewmaster", name: "Brewmaster", attribute: "universal" },
  { id: 79, key: "shadow_demon", name: "Shadow Demon", attribute: "intelligence" },
  { id: 80, key: "lone_druid", name: "Lone Druid", attribute: "agility" },
  { id: 81, key: "chaos_knight", name: "Chaos Knight", attribute: "strength" },
  { id: 82, key: "meepo", name: "Meepo", attribute: "agility" },
  { id: 83, key: "treant", name: "Treant Protector", attribute: "strength" },
  { id: 84, key: "ogre_magi", name: "Ogre Magi", attribute: "strength" },
  { id: 85, key: "undying", name: "Undying", attribute: "strength" },
  { id: 86, key: "rubick", name: "Rubick", attribute: "intelligence" },
  { id: 87, key: "disruptor", name: "Disruptor", attribute: "intelligence" },
  { id: 88, key: "nyx_assassin", name: "Nyx Assassin", attribute: "universal" },
  { id: 89, key: "naga_siren", name: "Naga Siren", attribute: "agility" },
  { id: 90, key: "keeper_of_the_light", name: "Keeper of the Light", attribute: "intelligence" },
  { id: 91, key: "wisp", name: "Io", attribute: "universal" },
  { id: 92, key: "visage", name: "Visage", attribute: "universal" },
  { id: 93, key: "slark", name: "Slark", attribute: "agility" },
  { id: 94, key: "medusa", name: "Medusa", attribute: "agility" },
  { id: 95, key: "troll_warlord", name: "Troll Warlord", attribute: "agility" },
  { id: 96, key: "centaur", name: "Centaur Warrunner", attribute: "strength" },
  { id: 97, key: "magnataur", name: "Magnus", attribute: "universal" },
  { id: 98, key: "shredder", name: "Timbersaw", attribute: "strength" },
  { id: 99, key: "bristleback", name: "Bristleback", attribute: "strength" },
  { id: 100, key: "tusk", name: "Tusk", attribute: "strength" },
  { id: 101, key: "skywrath_mage", name: "Skywrath Mage", attribute: "intelligence" },
  { id: 102, key: "abaddon", name: "Abaddon", attribute: "universal" },
  { id: 103, key: "elder_titan", name: "Elder Titan", attribute: "strength" },
  { id: 104, key: "legion_commander", name: "Legion Commander", attribute: "strength" },
  { id: 105, key: "techies", name: "Techies", attribute: "universal" },
  { id: 106, key: "ember_spirit", name: "Ember Spirit", attribute: "agility" },
  { id: 107, key: "earth_spirit", name: "Earth Spirit", attribute: "strength" },
  { id: 108, key: "abyssal_underlord", name: "Underlord", attribute: "strength" },
  { id: 109, key: "terrorblade", name: "Terrorblade", attribute: "agility" },
  { id: 110, key: "phoenix", name: "Phoenix", attribute: "strength" },
  { id: 111, key: "oracle", name: "Oracle", attribute: "intelligence" },
  { id: 112, key: "winter_wyvern", name: "Winter Wyvern", attribute: "intelligence" },
  { id: 113, key: "arc_warden", name: "Arc Warden", attribute: "universal" },
  { id: 114, key: "monkey_king", name: "Monkey King", attribute: "agility" },
  { id: 119, key: "dark_willow", name: "Dark Willow", attribute: "intelligence" },
  { id: 120, key: "pangolier", name: "Pangolier", attribute: "universal" },
  { id: 121, key: "grimstroke", name: "Grimstroke", attribute: "intelligence" },
  { id: 123, key: "hoodwink", name: "Hoodwink", attribute: "agility" },
  { id: 126, key: "void_spirit", name: "Void Spirit", attribute: "universal" },
  { id: 128, key: "snapfire", name: "Snapfire", attribute: "universal" },
  { id: 129, key: "mars", name: "Mars", attribute: "strength" },
  { id: 131, key: "ringmaster", name: "Ringmaster", attribute: "intelligence" },
  { id: 135, key: "dawnbreaker", name: "Dawnbreaker", attribute: "strength" },
  { id: 136, key: "marci", name: "Marci", attribute: "universal" },
  { id: 137, key: "primal_beast", name: "Primal Beast", attribute: "strength" },
  { id: 138, key: "muerta", name: "Muerta", attribute: "intelligence" },
  { id: 145, key: "kez", name: "Kez", attribute: "agility" },
  { id: 155, key: "largo", name: "Largo", attribute: "strength" },
];

const heroByKey = new Map(HEROES.map((hero) => [hero.key, hero]));
const heroByNormalizedName = new Map<string, HeroMeta>();

for (const hero of HEROES) {
  heroByNormalizedName.set(normalizeHeroText(hero.name), hero);
  heroByNormalizedName.set(normalizeHeroText(hero.key), hero);
}

const heroAliases: Record<string, string> = {
  "abyssal underlord": "abyssal_underlord",
  "anti mage": "antimage",
  "anti-mage": "antimage",
  "clockwerk": "rattletrap",
  "doom": "doom_bringer",
  "doom bringer": "doom_bringer",
  "io": "wisp",
  "lifestealer": "life_stealer",
  "life stealer": "life_stealer",
  "magnus": "magnataur",
  "natures prophet": "furion",
  "nature prophet": "furion",
  "nature's prophet": "furion",
  "necrophos": "necrolyte",
  "outworld destroyer": "obsidian_destroyer",
  "queen of pain": "queenofpain",
  "rattletrap": "rattletrap",
  "shadow fiend": "nevermore",
  "timbersaw": "shredder",
  "treant protector": "treant",
  "underlord": "abyssal_underlord",
  "vengeful spirit": "vengefulspirit",
  "windranger": "windrunner",
  "wraith king": "skeleton_king",
  "zeus": "zuus"
};

for (const [alias, key] of Object.entries(heroAliases)) {
  const hero = heroByKey.get(key);
  if (hero) {
    heroByNormalizedName.set(normalizeHeroText(alias), hero);
  }
}

export function getHeroByKey(key: string | null | undefined): HeroMeta | null {
  return key ? heroByKey.get(key) || null : null;
}

export function getHeroByName(value: string | null | undefined): HeroMeta | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeHeroText(value);
  return heroByNormalizedName.get(normalized) || heroByKey.get(heroAliases[normalized]) || null;
}

export function heroImage(key: string): string {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${key}.png`;
}

export function heroNameFromAny(value: string | null | undefined): string {
  return getHeroByName(value)?.name || titleizeHero(normalizeHeroText(value || ""));
}

export function heroKeyFromAny(value: string | null | undefined): string | null {
  return getHeroByName(value)?.key || null;
}

export function normalizeHeroText(value: string): string {
  return String(value || "")
    .replace(/^npc_dota_hero_/, "")
    .replace(/_/g, " ")
    .replace(/[’']/g, "")
    .trim()
    .toLowerCase();
}

function titleizeHero(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
