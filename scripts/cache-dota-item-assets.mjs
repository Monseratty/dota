import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { get } from "node:https";
import path from "node:path";

const root = process.cwd();
const itemDir = path.join(root, "apps/web/public/assets/dota/items");
const itemListUrl = "https://www.dota2.com/datafeed/itemlist?language=english";
const itemImageBase = "https://cdn.steamstatic.com/apps/dota2/images/dota_react/items";

const itemAliases = {
  assault_cuirass: "assault",
  battlefury: "bfury",
  blink_dagger: "blink",
  boots_of_travel: "travel_boots",
  boots_of_travel_2: "travel_boots_2",
  chain_mail: "chainmail",
  cranium_basher: "basher",
  dagon_upgraded: "dagon_5",
  divine_rapier: "rapier",
  empty_bottle: "bottle",
  enhancement_timelss: "enhancement_timeless",
  gem_of_true_sight: "gem",
  ironwood_branch: "branches",
  invisibility_edge: "silver_edge",
  moonshard: "moon_shard",
  observer_ward: "ward_observer",
  orchid_malevolence: "orchid",
  perseverance: "pers",
  plate_mail: "platemail",
  refresher_orb: "refresher",
  sentry_ward: "ward_sentry",
  sheep_stick: "sheepstick",
  splint_mail: "splintmail"
};

await mkdir(itemDir, { recursive: true });

const officialItems = JSON.parse(await fetchText(itemListUrl)).result.data.itemabilities;
const officialKeys = officialItems
  .map((item) => item.name?.replace(/^item_/, ""))
  .filter(Boolean)
  .filter((key) => !key.startsWith("recipe_"));

const usedKeys = await collectUsedItemKeys(path.join(root, "storage/parsed"));
const canonicalKeys = new Set(["recipe", ...officialKeys]);
for (const key of usedKeys) {
  if (!key || key.startsWith("recipe_")) {
    continue;
  }
  canonicalKeys.add(itemAliases[key] || key);
}

let downloaded = 0;
let skipped = 0;
const failed = [];

for (const key of [...canonicalKeys].sort()) {
  const out = path.join(itemDir, `${key}.png`);
  if (await existsWithBytes(out)) {
    skipped += 1;
    continue;
  }

  const ok = await downloadFile(`${itemImageBase}/${key}.png`, out).catch((error) => {
    failed.push({ key, reason: error.message });
    return false;
  });

  if (ok) {
    downloaded += 1;
  }
}

for (const [alias, canonical] of Object.entries(itemAliases)) {
  const source = path.join(itemDir, `${canonical}.png`);
  const target = path.join(itemDir, `${alias}.png`);
  if (await existsWithBytes(source)) {
    await copyFile(source, target);
  }
}

await writeFile(
  path.join(itemDir, "manifest.json"),
  `${JSON.stringify({
    count: (await readdir(itemDir)).filter((file) => file.endsWith(".png")).length,
    aliases: itemAliases,
    failed
  }, null, 2)}\n`
);

console.log(`Item assets ready: ${downloaded} downloaded, ${skipped} skipped, ${failed.length} failed.`);
if (failed.length) {
  console.log(failed.map((item) => `${item.key}: ${item.reason}`).join("\n"));
}

async function collectUsedItemKeys(parsedDir) {
  const keys = new Set();

  try {
    for (const entry of await readdir(parsedDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const dashboardPath = path.join(parsedDir, entry.name, "dashboard.json");
      if (!(await existsWithBytes(dashboardPath))) {
        continue;
      }

      const dashboard = JSON.parse(await readFile(dashboardPath, "utf8"));
      for (const build of Object.values(dashboard.itemBuilds || {})) {
        for (const item of build || []) {
          keys.add(item?.key);
        }
      }
      for (const inventory of dashboard.finalInventory || []) {
        for (const group of ["main", "backpack", "tp", "neutral", "enhancement"]) {
          for (const item of inventory[group] || []) {
            keys.add(item?.key);
          }
        }
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  return keys;
}

async function existsWithBytes(filePath) {
  try {
    return (await stat(filePath)).size > 0;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function fetchText(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      if (isRedirect(response.statusCode) && response.headers.location && redirects > 0) {
        response.resume();
        fetchText(new URL(response.headers.location, url).toString(), redirects - 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        response.resume();
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

async function downloadFile(url, out, redirects = 5) {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      if (isRedirect(response.statusCode) && response.headers.location && redirects > 0) {
        response.resume();
        downloadFile(new URL(response.headers.location, url).toString(), out, redirects - 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200 || !String(response.headers["content-type"] || "").startsWith("image/")) {
        reject(new Error(`HTTP ${response.statusCode || "unknown"}`));
        response.resume();
        return;
      }

      const file = createWriteStream(out);
      response.pipe(file);
      file.on("finish", () => {
        file.close(() => resolve(true));
      });
      file.on("error", reject);
    }).on("error", reject);
  });
}

function isRedirect(statusCode) {
  return statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308;
}
